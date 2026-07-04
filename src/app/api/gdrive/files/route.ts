import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { getDriveToken, listMediaFiles } from "@/lib/gdrive";

// 素材フォルダ内の画像/動画一覧（ピッカー用）。
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const integration = await prisma.driveIntegration.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!integration) return Response.json({ connected: false, files: [] });
  if (!integration.folderId) {
    return Response.json({ connected: true, folder: null, files: [], googleEmail: integration.googleEmail });
  }

  const token = await getDriveToken(integration);
  if (!token) {
    return Response.json({ connected: true, expired: true, files: [] }, { status: 400 });
  }

  try {
    const files = await listMediaFiles(token, integration.folderId);
    return Response.json({
      connected: true,
      googleEmail: integration.googleEmail,
      folder: { id: integration.folderId, name: integration.folderName },
      files,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "一覧の取得に失敗しました" }, { status: 502 });
  }
}
