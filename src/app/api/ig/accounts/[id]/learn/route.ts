import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { learnToneProfile, NoCaptionsError } from "@/lib/tone";

export const runtime = "nodejs";
export const maxDuration = 120;

// 過去投稿のキャプションから文体を学習（手動トリガー・再学習兼用）。
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const account = await prisma.igAccount.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!account) return Response.json({ error: "not found" }, { status: 404 });

  try {
    const profile = await learnToneProfile(account);
    return Response.json({ ok: true, toneProfile: profile, toneProfileAt: new Date().toISOString() });
  } catch (e) {
    const status = e instanceof NoCaptionsError ? 400 : 502;
    return Response.json({ error: e instanceof Error ? e.message : "学習に失敗しました" }, { status });
  }
}
