import { prisma } from "@/lib/db";
import { requireOrgPage } from "@/lib/auth-helpers";
import { StoriesClient } from "./StoriesClient";
import type { StoryView } from "../view-types";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const { organizationId } = await requireOrgPage();

  const stories = await prisma.story.findMany({
    where: { organizationId },
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

  const views: StoryView[] = stories.map((s) => ({
    id: s.id,
    igAccountId: s.igAccountId,
    username: s.igAccount.username,
    concept: s.concept,
    overlayTitle: s.overlayTitle,
    overlaySub: s.overlaySub,
    status: s.status,
    source: s.source,
    mediaType: s.mediaType,
    sourceKind: s.sourceKind,
    scheduledAt: s.scheduledAt?.toISOString() ?? null,
    postedAt: s.postedAt?.toISOString() ?? null,
    errorMessage: s.errorMessage,
    createdAt: s.createdAt.toISOString(),
    imageUrl: `/api/story-image/${s.id}`,
  }));

  return <StoriesClient initialStories={views} />;
}
