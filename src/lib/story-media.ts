// 手持ち素材（アップロード / Googleドライブ / 過去のIG投稿）からストーリーズを作る共通処理。
// 画面のAPIとcron（オートパイロットのライブラリモード）の両方から使う。

import { randomBytes } from "crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { renderStoryCard, STORY_WIDTH, STORY_HEIGHT } from "@/lib/story-image";
import { planCopyForMedia, type MediaCopyPlan } from "@/lib/story-generator";
import { getDriveToken, fetchDriveFile, listMediaFiles, driveIntegrationForOrg, type DriveFile } from "@/lib/gdrive";
import type { IgAccount } from "@/generated/prisma/client";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // IGストーリーズ動画の上限目安

export type MediaSource =
  | { kind: "upload"; dataUrl: string; fileName?: string | null }
  | { kind: "library"; fileId: string; fileName?: string | null; mimeType: string }
  | { kind: "ig"; igMediaId: string; mediaUrl: string; mediaType: string; caption?: string | null };

export interface CreateFromMediaOptions {
  overlay: boolean; // 画像にAIコピーを載せるか（動画は常にfalse扱い）
  instruction?: string | null;
  source: "manual" | "auto";
}

// 画像バッファ → 1080x1920 のストーリーズJPEG（コピーなし・カバートリミング）
export async function resizePlain(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate() // EXIFの向きを反映
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88 })
    .toBuffer();
}

// 画像バッファ → コピーを焼き込んだストーリーズJPEG
export async function composeWithCopy(buffer: Buffer, plan: MediaCopyPlan, handle: string): Promise<Buffer> {
  // satori に渡す前に向き反映＋適度に縮小（巨大画像でのメモリ膨張を防ぐ）
  const normalized = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: "cover", position: "attention" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return renderStoryCard({
    title: plan.overlayTitle,
    sub: plan.overlaySub,
    handle,
    bgImageDataUrl: `data:image/jpeg;base64,${normalized.toString("base64")}`,
  });
}

// 動画サムネイルが取れない場合の代替ポスター
async function fallbackPoster(): Promise<Buffer> {
  return sharp({
    create: { width: STORY_WIDTH, height: STORY_HEIGHT, channels: 3, background: { r: 24, g: 24, b: 32 } },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function fetchAsBuffer(url: string, maxBytes: number, headers?: Record<string, string>): Promise<Buffer> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`メディアの取得に失敗しました (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`ファイルが大きすぎます（${Math.round(buf.length / 1024 / 1024)}MB）`);
  return buf;
}

// 素材からストーリーズ（下書き）を作成して Story レコードを返す。
export async function createStoryFromMedia(
  account: IgAccount,
  media: MediaSource,
  opts: CreateFromMediaOptions
) {
  const isVideo =
    (media.kind === "library" && media.mimeType.startsWith("video/")) ||
    (media.kind === "ig" && media.mediaType === "VIDEO");

  // ── コピー立案（画像×overlay時のみ） ──
  let plan: MediaCopyPlan | null = null;
  if (!isVideo && opts.overlay) {
    const recent = await prisma.story.findMany({
      where: { igAccountId: account.id, overlayTitle: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { overlayTitle: true },
    });
    plan = await planCopyForMedia({
      username: account.username,
      theme: account.autoStoryTheme,
      instruction: opts.instruction,
      caption: media.kind === "ig" ? media.caption : null,
      fileName: media.kind !== "ig" ? media.fileName : null,
      recentTitles: recent.map((r) => r.overlayTitle!).filter(Boolean),
      toneProfile: account.toneProfile,
    });
  }

  // ── メディア解決 ──
  let imageData: string; // 画像本体 or 動画サムネ
  let videoSrc: string | null = null;
  let videoToken: string | null = null;
  let sourceRef: string | null = null;

  if (media.kind === "upload") {
    const comma = media.dataUrl.indexOf(",");
    if (comma === -1) throw new Error("画像データが不正です");
    const buf = Buffer.from(media.dataUrl.slice(comma + 1), "base64");
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("画像は15MB以下にしてください");
    const jpeg = plan ? await composeWithCopy(buf, plan, account.username) : await resizePlain(buf);
    imageData = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } else if (media.kind === "library") {
    const integration = await driveIntegrationForOrg(account.organizationId);
    if (!integration) throw new Error("Googleドライブが未連携です");
    const token = await getDriveToken(integration);
    if (!token) throw new Error("Googleドライブの再連携が必要です");
    sourceRef = `drive:${media.fileId}`;

    if (isVideo) {
      // 動画本体は取り込み時にIGがプロキシ経由で取得する。ここではサムネのみ用意
      videoSrc = `drive:${media.fileId}`;
      videoToken = randomBytes(24).toString("hex");
      imageData = await driveThumbnail(token, media.fileId);
    } else {
      const res = await fetchDriveFile(token, media.fileId);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) throw new Error("画像は15MB以下にしてください");
      const jpeg = plan ? await composeWithCopy(buf, plan, account.username) : await resizePlain(buf);
      imageData = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }
  } else {
    // 過去のIG投稿
    sourceRef = `ig:${media.igMediaId}`;
    if (isVideo) {
      // media_url は公開CDN直リンクなのでそのまま IG に渡せる
      videoSrc = media.mediaUrl;
      imageData = `data:image/jpeg;base64,${(await fallbackPoster()).toString("base64")}`;
    } else {
      const buf = await fetchAsBuffer(media.mediaUrl, MAX_IMAGE_BYTES);
      const jpeg = plan ? await composeWithCopy(buf, plan, account.username) : await resizePlain(buf);
      imageData = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }
  }

  return prisma.story.create({
    data: {
      organizationId: account.organizationId,
      igAccountId: account.id,
      concept: plan?.concept ?? null,
      overlayTitle: plan?.overlayTitle ?? null,
      overlaySub: plan?.overlaySub ?? null,
      imageData,
      mediaType: isVideo ? "video" : "image",
      sourceKind: media.kind === "ig" ? "ig" : media.kind,
      sourceRef,
      videoSrc,
      videoToken,
      status: "draft",
      source: opts.source,
    },
  });
}

// ドライブ動画のサムネイル（thumbnailLink は短命URLのため取得してDBに保存する）
async function driveThumbnail(token: string, fileId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = (await res.json()) as { thumbnailLink?: string };
    if (json.thumbnailLink) {
      // =s220 → 大きめに差し替え（Driveサムネの慣例パラメータ）
      const big = json.thumbnailLink.replace(/=s\d+$/, "=s1080");
      const buf = await fetchAsBuffer(big, 8 * 1024 * 1024);
      const jpeg = await resizePlain(buf);
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }
  } catch (e) {
    console.error("drive thumbnail failed:", e);
  }
  return `data:image/jpeg;base64,${(await fallbackPoster()).toString("base64")}`;
}

// オートパイロット（library/mix）用: フォルダから未使用ファイルを1つ選んで返す。
// 直近のストーリーズで使った sourceRef を避け、それでも尽きたら全体からランダム。
export async function pickLibraryFile(account: IgAccount): Promise<DriveFile | null> {
  const integration = await driveIntegrationForOrg(account.organizationId);
  if (!integration?.folderId) return null;
  const token = await getDriveToken(integration);
  if (!token) return null;

  const files = await listMediaFiles(token, integration.folderId);
  if (files.length === 0) return null;

  const recent = await prisma.story.findMany({
    where: { igAccountId: account.id, sourceRef: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { sourceRef: true },
  });
  const used = new Set(recent.map((r) => r.sourceRef));
  const fresh = files.filter((f) => !used.has(`drive:${f.id}`));
  const pool = fresh.length > 0 ? fresh : files;
  return pool[Math.floor(Math.random() * pool.length)];
}
