import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { IMAGE_STYLES } from "@/lib/story-generator";

// ストーリーズ自動運用（オートパイロット）設定の更新。
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const { id } = await params;

  const account = await prisma.igAccount.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!account) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    autoStoryEnabled?: boolean;
    autoStoryTimes?: string;
    autoStoryTheme?: string;
    autoStoryStyle?: string;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.autoStoryEnabled === "boolean") data.autoStoryEnabled = body.autoStoryEnabled;
  if (typeof body.autoStoryTheme === "string") data.autoStoryTheme = body.autoStoryTheme.trim() || null;
  if (typeof body.autoStoryStyle === "string" && IMAGE_STYLES[body.autoStoryStyle]) {
    data.autoStoryStyle = body.autoStoryStyle;
  }
  if (typeof body.autoStoryTimes === "string") {
    // "08:00, 20:00" → 正規化。妥当な HH:mm 以外は弾く
    const times = body.autoStoryTimes
      .split(/[,、\s]+/)
      .map((t) => t.trim())
      .filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t))
      .map((t) => (t.length === 4 ? `0${t}` : t));
    data.autoStoryTimes = times.length > 0 ? Array.from(new Set(times)).sort().join(",") : null;
  }

  const updated = await prisma.igAccount.update({ where: { id }, data });
  return Response.json({
    ok: true,
    account: {
      id: updated.id,
      autoStoryEnabled: updated.autoStoryEnabled,
      autoStoryTimes: updated.autoStoryTimes,
      autoStoryTheme: updated.autoStoryTheme,
      autoStoryStyle: updated.autoStoryStyle,
    },
  });
}
