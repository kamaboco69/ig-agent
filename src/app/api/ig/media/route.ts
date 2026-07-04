import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { getIgToken } from "@/lib/ig-token";
import { getUserMedia } from "@/lib/ig-api";

// 連携アカウントの過去投稿一覧（「過去のIG投稿から再利用」ピッカー用）。
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const accountId = req.nextUrl.searchParams.get("accountId");
  const account = accountId
    ? await prisma.igAccount.findFirst({ where: { id: accountId, organizationId: ctx.organizationId } })
    : await prisma.igAccount.findFirst({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "asc" },
      });
  if (!account) return Response.json({ error: "Instagramアカウントが未連携です" }, { status: 400 });

  const token = await getIgToken(account);
  if (!token) return Response.json({ error: "Instagramの再連携が必要です" }, { status: 400 });

  try {
    const items = await getUserMedia(token, account.igUserId, 40);
    // カルーセルは先頭画像を扱えないため除外（シンプルさ優先）
    return Response.json({
      items: items.filter((m) => m.mediaType === "IMAGE" || m.mediaType === "VIDEO"),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "取得に失敗しました" }, { status: 502 });
  }
}
