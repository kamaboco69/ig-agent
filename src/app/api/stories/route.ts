import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";

// ストーリーズ一覧（画像本体は含めず、配信URLで参照する）。
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const stories = await prisma.story.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      igAccountId: true,
      concept: true,
      overlayTitle: true,
      overlaySub: true,
      status: true,
      source: true,
      mediaType: true,
      sourceKind: true,
      scheduledAt: true,
      postedAt: true,
      errorMessage: true,
      createdAt: true,
      igAccount: { select: { username: true } },
    },
  });

  return Response.json({
    stories: stories.map((s) => ({ ...s, imageUrl: `/api/story-image/${s.id}` })),
  });
}
