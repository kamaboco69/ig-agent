import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { generateStory } from "@/lib/story-generator";

export const runtime = "nodejs";
export const maxDuration = 120; // 構成生成＋画像生成＋合成で数十秒かかる

// ストーリーズをAIで1枚作成して下書き保存する。
// body: { igAccountId, instruction?, theme?, style? }
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    igAccountId?: string;
    instruction?: string;
    theme?: string;
    style?: string;
  };

  const account = body.igAccountId
    ? await prisma.igAccount.findFirst({
        where: { id: body.igAccountId, organizationId: ctx.organizationId },
      })
    : await prisma.igAccount.findFirst({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "asc" },
      });
  if (!account) {
    return Response.json({ error: "Instagramアカウントを先に連携してください" }, { status: 400 });
  }

  // 直近のコピーを渡してマンネリを避ける
  const recent = await prisma.story.findMany({
    where: { igAccountId: account.id, overlayTitle: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { overlayTitle: true },
  });

  try {
    const generated = await generateStory({
      username: account.username,
      theme: body.theme ?? account.autoStoryTheme,
      instruction: body.instruction,
      recentTitles: recent.map((r) => r.overlayTitle!).filter(Boolean),
      style: body.style ?? account.autoStoryStyle,
    });

    const story = await prisma.story.create({
      data: {
        organizationId: ctx.organizationId,
        igAccountId: account.id,
        concept: generated.concept,
        overlayTitle: generated.overlayTitle,
        overlaySub: generated.overlaySub,
        imagePrompt: generated.imagePrompt,
        imageData: generated.imageData,
        status: "draft",
        source: "manual",
      },
    });

    return Response.json(
      {
        story: {
          id: story.id,
          overlayTitle: story.overlayTitle,
          overlaySub: story.overlaySub,
          concept: story.concept,
          status: story.status,
          imageUrl: `/api/story-image/${story.id}`,
          usedAiBackground: generated.usedAiBackground,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "生成に失敗しました";
    return Response.json({ error: msg }, { status: 502 });
  }
}
