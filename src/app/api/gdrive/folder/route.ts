import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { extractFolderId, getDriveToken, getFolder } from "@/lib/gdrive";

// 素材フォルダの設定。フォルダURL（または ID）を受け取り、実在検証して保存する。
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const integration = await prisma.driveIntegration.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!integration) return Response.json({ error: "Googleドライブが未連携です" }, { status: 400 });

  const { folderUrl } = (await req.json().catch(() => ({}))) as { folderUrl?: string };
  const folderId = folderUrl ? extractFolderId(folderUrl) : null;
  if (!folderId) {
    return Response.json({ error: "フォルダのURLまたはIDを入力してください" }, { status: 400 });
  }

  const token = await getDriveToken(integration);
  if (!token) return Response.json({ error: "Googleドライブの再連携が必要です" }, { status: 400 });

  const folder = await getFolder(token, folderId);
  if (!folder) {
    return Response.json(
      { error: "フォルダが見つかりません（URLが正しいか・連携したGoogleアカウントで閲覧できるか確認してください）" },
      { status: 400 }
    );
  }

  await prisma.driveIntegration.update({
    where: { id: integration.id },
    data: { folderId: folder.id, folderName: folder.name },
  });
  return Response.json({ ok: true, folder });
}
