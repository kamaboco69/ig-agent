import { prisma } from "@/lib/db";
import { requireOrgPage } from "@/lib/auth-helpers";
import { RecurringClient } from "./RecurringClient";
import type { RecurringView } from "../view-types";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const { organizationId } = await requireOrgPage();

  const [items, accounts, drive] = await Promise.all([
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
    prisma.igAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true },
    }),
    prisma.driveIntegration.findUnique({
      where: { organizationId },
      select: { status: true, folderId: true },
    }),
  ]);

  const views: RecurringView[] = items.map((r) => ({
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

  return (
    <RecurringClient
      initialItems={views}
      accounts={accounts}
      driveReady={!!drive && drive.status === "connected"}
    />
  );
}
