import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { publishStoryRecord } from "@/lib/story-publisher";

export const runtime = "nodejs";
export const maxDuration = 120; // IG のメディア取り込み待ち（最大60秒ポーリング）を含む

// 「今すぐ投稿」。draft / scheduled / failed から実投稿する。
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const story = await prisma.story.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!story) return Response.json({ error: "not found" }, { status: 404 });

  // 二重投稿防止: 対象ステータスからのみ posting に原子的に遷移
  const claim = await prisma.story.updateMany({
    where: { id, status: { in: ["draft", "scheduled", "failed"] } },
    data: { status: "posting" },
  });
  if (claim.count === 0) {
    return Response.json({ error: "このストーリーズは投稿中または投稿済みです" }, { status: 409 });
  }

  const result = await publishStoryRecord(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }
  return Response.json({ ok: true, igMediaId: result.igMediaId });
}
