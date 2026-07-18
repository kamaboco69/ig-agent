import { prisma } from "@/lib/db";
import { requireOrgPage } from "@/lib/auth-helpers";
import { igConfigured } from "@/lib/ig-api";
import { DashboardClient, type AccountView, type StoryView, type DriveView, type RecurringView } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { organizationId } = await requireOrgPage();

  const [accounts, stories, driveIntegration, recurringItems] = await Promise.all([
    prisma.igAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        accountType: true,
        status: true,
        tokenExpiresAt: true,
        autoStoryEnabled: true,
        autoStoryTimes: true,
        autoStoryTheme: true,
        autoStoryStyle: true,
        autoStorySource: true,
        toneProfile: true,
        toneProfileAt: true,
      },
    }),
    prisma.story.findMany({
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
    }),
    prisma.driveIntegration.findUnique({
      where: { organizationId },
      select: { googleEmail: true, folderId: true, folderName: true, status: true },
    }),
    prisma.recurringStory.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        igAccountId: true,
        name: true,
        mode: true,
        instruction: true,
        imageData: true,
        driveFolderName: true,
        intervalDays: true,
        timeJst: true,
        enabled: true,
        nextRunAt: true,
        igAccount: { select: { username: true } },
      },
    }),
  ]);

  const accountViews: AccountView[] = accounts.map((a) => ({
    ...a,
    tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
    toneProfileAt: a.toneProfileAt?.toISOString() ?? null,
  }));
  const recurringViews: RecurringView[] = recurringItems.map((r) => ({
    id: r.id,
    igAccountId: r.igAccountId,
    username: r.igAccount.username,
    name: r.name,
    mode: r.mode,
    instruction: r.instruction,
    hasImage: !!r.imageData,
    driveFolderName: r.driveFolderName,
    intervalDays: r.intervalDays,
    timeJst: r.timeJst,
    enabled: r.enabled,
    nextRunAt: r.nextRunAt.toISOString(),
  }));
  const storyViews: StoryView[] = stories.map((s) => ({
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
  const driveView: DriveView = {
    connected: !!driveIntegration && driveIntegration.status === "connected",
    googleEmail: driveIntegration?.googleEmail ?? null,
    folderId: driveIntegration?.folderId ?? null,
    folderName: driveIntegration?.folderName ?? null,
  };

  return (
    <DashboardClient
      configured={igConfigured()}
      initialAccounts={accountViews}
      initialStories={storyViews}
      initialRecurring={recurringViews}
      drive={driveView}
    />
  );
}
