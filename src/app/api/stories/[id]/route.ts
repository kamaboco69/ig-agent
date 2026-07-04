import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";

// 予約設定/解除。body: { scheduledAt: ISO文字列 } で予約、{ scheduledAt: null } で下書きに戻す。
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const story = await prisma.story.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!story) return Response.json({ error: "not found" }, { status: 404 });
  if (story.status === "posted" || story.status === "posting") {
    return Response.json({ error: "投稿済み/投稿中のストーリーズは変更できません" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { scheduledAt?: string | null };

  if (body.scheduledAt === null) {
    const updated = await prisma.story.update({
      where: { id },
      data: { status: "draft", scheduledAt: null, errorMessage: null },
    });
    return Response.json({ ok: true, story: { id: updated.id, status: updated.status } });
  }

  const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!when || isNaN(when.getTime())) {
    return Response.json({ error: "scheduledAt が不正です" }, { status: 400 });
  }
  if (when.getTime() < Date.now() - 60_000) {
    return Response.json({ error: "過去の日時は指定できません" }, { status: 400 });
  }

  const updated = await prisma.story.update({
    where: { id },
    data: { status: "scheduled", scheduledAt: when, errorMessage: null },
  });
  return Response.json({
    ok: true,
    story: { id: updated.id, status: updated.status, scheduledAt: updated.scheduledAt },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const story = await prisma.story.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!story) return Response.json({ error: "not found" }, { status: 404 });
  if (story.status === "posting") {
    return Response.json({ error: "投稿中のストーリーズは削除できません" }, { status: 400 });
  }

  await prisma.story.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
