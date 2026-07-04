import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { createStoryFromMedia, type MediaSource } from "@/lib/story-media";

export const runtime = "nodejs";
export const maxDuration = 120;

// 素材（アップロード / ドライブ / 過去IG投稿）からストーリーズを作成して下書き保存する。
// body: { igAccountId?, source: "upload"|"library"|"ig", overlay?, instruction?,
//         dataUrl?/fileName?（upload）, fileId?/mimeType?（library）,
//         igMediaId?/mediaUrl?/mediaTypeHint?/caption?（ig） }
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    igAccountId?: string;
    source?: string;
    overlay?: boolean;
    instruction?: string;
    dataUrl?: string;
    fileName?: string;
    fileId?: string;
    mimeType?: string;
    igMediaId?: string;
    mediaUrl?: string;
    mediaTypeHint?: string;
    caption?: string;
  };

  const account = body.igAccountId
    ? await prisma.igAccount.findFirst({ where: { id: body.igAccountId, organizationId: ctx.organizationId } })
    : await prisma.igAccount.findFirst({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "asc" },
      });
  if (!account) {
    return Response.json({ error: "Instagramアカウントを先に連携してください" }, { status: 400 });
  }

  let media: MediaSource;
  if (body.source === "upload") {
    if (!body.dataUrl?.startsWith("data:image/")) {
      return Response.json({ error: "画像ファイルを選択してください（動画はドライブ/過去投稿から）" }, { status: 400 });
    }
    media = { kind: "upload", dataUrl: body.dataUrl, fileName: body.fileName ?? null };
  } else if (body.source === "library") {
    if (!body.fileId || !body.mimeType) {
      return Response.json({ error: "ファイルを選択してください" }, { status: 400 });
    }
    media = { kind: "library", fileId: body.fileId, mimeType: body.mimeType, fileName: body.fileName ?? null };
  } else if (body.source === "ig") {
    if (!body.igMediaId || !body.mediaUrl) {
      return Response.json({ error: "投稿を選択してください" }, { status: 400 });
    }
    media = {
      kind: "ig",
      igMediaId: body.igMediaId,
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaTypeHint === "VIDEO" ? "VIDEO" : "IMAGE",
      caption: body.caption ?? null,
    };
  } else {
    return Response.json({ error: "source が不正です" }, { status: 400 });
  }

  try {
    const story = await createStoryFromMedia(account, media, {
      overlay: body.overlay !== false, // 既定はコピーを載せる
      instruction: body.instruction,
      source: "manual",
    });
    return Response.json(
      {
        story: {
          id: story.id,
          overlayTitle: story.overlayTitle,
          overlaySub: story.overlaySub,
          concept: story.concept,
          status: story.status,
          mediaType: story.mediaType,
          imageUrl: `/api/story-image/${story.id}`,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "作成に失敗しました" }, { status: 502 });
  }
}
