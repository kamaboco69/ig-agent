// ストーリーズ1件の実投稿。画面の「今すぐ投稿」と cron（予約/自動運用）の両方から使う。
// 呼び出し側が status を "posting" に claim してから呼ぶこと（二重投稿防止）。

import { prisma } from "@/lib/db";
import { getIgToken } from "@/lib/ig-token";
import { publishStory } from "@/lib/ig-api";
import { appBaseUrl } from "@/lib/base-url";

export interface PublishResult {
  ok: boolean;
  igMediaId?: string;
  error?: string;
}

export async function publishStoryRecord(storyId: string): Promise<PublishResult> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { igAccount: true },
  });
  if (!story) return { ok: false, error: "ストーリーズが見つかりません" };

  const fail = async (message: string): Promise<PublishResult> => {
    await prisma.story.update({
      where: { id: storyId },
      data: { status: "failed", errorMessage: message.slice(0, 500) },
    });
    return { ok: false, error: message };
  };

  const token = await getIgToken(story.igAccount);
  if (!token) {
    return fail("Instagramアカウントの再連携が必要です（トークン失効）");
  }

  // IG サーバーが取得しに来る公開URL（このアプリの画像配信ルート）
  const imageUrl = `${appBaseUrl()}/api/story-image/${story.id}`;

  try {
    const igMediaId = await publishStory(token, story.igAccount.igUserId, imageUrl);
    await prisma.story.update({
      where: { id: storyId },
      data: { status: "posted", postedAt: new Date(), igMediaId, errorMessage: null },
    });
    return { ok: true, igMediaId };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "投稿に失敗しました");
  }
}
