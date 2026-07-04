import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { nextOccurrenceJst } from "@/lib/recurring";

// 有効/無効の切り替え・時刻/間隔/指示の変更。
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const item = await prisma.recurringStory.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!item) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    timeJst?: string;
    intervalDays?: number;
    instruction?: string;
    name?: string;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 50);
  if (typeof body.instruction === "string") data.instruction = body.instruction.trim() || null;
  if ([1, 2, 3, 7, 14].includes(Number(body.intervalDays))) data.intervalDays = Number(body.intervalDays);
  if (typeof body.timeJst === "string" && body.timeJst.trim()) {
    try {
      data.timeJst = body.timeJst.trim();
      data.nextRunAt = nextOccurrenceJst(body.timeJst);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "時刻が不正です" }, { status: 400 });
    }
  }

  const updated = await prisma.recurringStory.update({ where: { id }, data });
  return Response.json({
    ok: true,
    item: {
      id: updated.id,
      enabled: updated.enabled,
      timeJst: updated.timeJst,
      intervalDays: updated.intervalDays,
      nextRunAt: updated.nextRunAt.toISOString(),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const item = await prisma.recurringStory.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!item) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.recurringStory.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
