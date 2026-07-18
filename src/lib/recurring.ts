// 定期配信（RecurringStory）の実行ロジック。cron から呼ばれる。

import { prisma } from "@/lib/db";
import { generateStory } from "@/lib/story-generator";
import { createStoryFromMedia, pickLibraryFile } from "@/lib/story-media";
import { publishStoryRecord } from "@/lib/story-publisher";
import type { RecurringStory } from "@/generated/prisma/client";

// 実行が遅れてもこの窓内なら投稿する（過ぎたらスキップして次回へ。「本日◯時」系の鮮度を守る）
export const RECURRING_WINDOW_MS = 45 * 60 * 1000;

// timeJst（"HH:mm"）の次の到来時刻（UTC）を返す。from 以降で最初のスロット。
export function nextOccurrenceJst(timeJst: string, from: Date = new Date()): Date {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeJst.trim());
  if (!m) throw new Error("時刻は HH:mm 形式で指定してください");
  const hh = Number(m[1]);
  const mm = Number(m[2]);

  const jstNow = new Date(from.getTime() + 9 * 3600 * 1000);
  const slot = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), hh - 9, mm)
  );
  if (slot.getTime() <= from.getTime()) {
    return new Date(slot.getTime() + 24 * 3600 * 1000);
  }
  return slot;
}

export interface RecurringRunResult {
  ran: boolean; // 生成・投稿を実行したか（窓超過スキップは false）
  published: boolean;
  error?: string;
}

// 1件の定期配信を実行する。呼び出し側で claim（nextRunAt の先送り）済みであること。
export async function runRecurring(
  r: RecurringStory,
  opts: { skippedWindow: boolean }
): Promise<RecurringRunResult> {
  if (opts.skippedWindow) return { ran: false, published: false };

  const account = await prisma.igAccount.findUnique({ where: { id: r.igAccountId } });
  if (!account || account.status !== "connected") {
    return { ran: false, published: false, error: "アカウント未接続" };
  }

  try {
    let storyId: string;
    if (r.mode === "library") {
      // この配信専用のドライブフォルダ（未設定なら組織デフォルト）から素材をローテーション
      const file = await pickLibraryFile(account, r.driveFolderId);
      if (!file) {
        return { ran: false, published: false, error: "素材フォルダにファイルがありません（またはドライブ未連携）" };
      }
      const story = await createStoryFromMedia(
        account,
        { kind: "library", fileId: file.id, mimeType: file.mimeType, fileName: file.name },
        { overlay: true, instruction: r.instruction, source: "auto" }
      );
      await prisma.story.update({
        where: { id: story.id },
        data: {
          status: "posting",
          concept: `定期配信「${r.name}」${story.concept ? `: ${story.concept}` : ""}`,
        },
      });
      storyId = story.id;
    } else if (r.mode === "fixed") {
      if (!r.imageData) return { ran: false, published: false, error: "登録画像がありません" };
      const story = await prisma.story.create({
        data: {
          organizationId: r.organizationId,
          igAccountId: r.igAccountId,
          concept: `定期配信「${r.name}」`,
          imageData: r.imageData,
          mediaType: "image",
          sourceKind: "upload",
          sourceRef: `recurring:${r.id}`,
          status: "posting",
          source: "auto",
        },
      });
      storyId = story.id;
    } else {
      // aiモード: 登録した指示で毎回生成（コピーは日替わりになる）
      const recent = await prisma.story.findMany({
        where: { igAccountId: r.igAccountId, sourceRef: `recurring:${r.id}`, overlayTitle: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { overlayTitle: true },
      });
      const generated = await generateStory({
        username: account.username,
        theme: account.autoStoryTheme,
        instruction: r.instruction,
        recentTitles: recent.map((x) => x.overlayTitle!).filter(Boolean),
        style: account.autoStoryStyle,
        toneProfile: account.toneProfile,
      });
      const story = await prisma.story.create({
        data: {
          organizationId: r.organizationId,
          igAccountId: r.igAccountId,
          concept: `定期配信「${r.name}」: ${generated.concept}`,
          overlayTitle: generated.overlayTitle,
          overlaySub: generated.overlaySub,
          imagePrompt: generated.imagePrompt,
          imageData: generated.imageData,
          sourceRef: `recurring:${r.id}`,
          status: "posting",
          source: "auto",
        },
      });
      storyId = story.id;
    }

    const pub = await publishStoryRecord(storyId);
    return { ran: true, published: pub.ok, error: pub.error };
  } catch (e) {
    return { ran: true, published: false, error: e instanceof Error ? e.message : String(e) };
  }
}
