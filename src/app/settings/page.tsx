import { prisma } from "@/lib/db";
import { requireOrgPage } from "@/lib/auth-helpers";
import { igConfigured } from "@/lib/ig-api";
import { SettingsClient } from "./SettingsClient";
import type { AccountView, DriveView } from "../view-types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { organizationId } = await requireOrgPage();

  const [accounts, driveIntegration] = await Promise.all([
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
    prisma.driveIntegration.findUnique({
      where: { organizationId },
      select: { googleEmail: true, folderId: true, folderName: true, status: true },
    }),
  ]);

  const accountViews: AccountView[] = accounts.map((a) => ({
    ...a,
    tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
    toneProfileAt: a.toneProfileAt?.toISOString() ?? null,
  }));
  const driveView: DriveView = {
    connected: !!driveIntegration && driveIntegration.status === "connected",
    googleEmail: driveIntegration?.googleEmail ?? null,
    folderId: driveIntegration?.folderId ?? null,
    folderName: driveIntegration?.folderName ?? null,
  };

  return <SettingsClient configured={igConfigured()} accounts={accountViews} drive={driveView} />;
}
