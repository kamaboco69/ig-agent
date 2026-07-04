import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";

// IG アカウントの連携解除（レコード削除。ストーリーズ履歴も cascade で消える）。
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const { accountId } = (await req.json().catch(() => ({}))) as { accountId?: string };
  if (!accountId) return Response.json({ error: "accountId は必須です" }, { status: 400 });

  const account = await prisma.igAccount.findFirst({
    where: { id: accountId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!account) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.igAccount.delete({ where: { id: account.id } });
  return Response.json({ ok: true });
}
