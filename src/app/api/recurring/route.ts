import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { nextOccurrenceJst } from "@/lib/recurring";
import { resizePlain } from "@/lib/story-media";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_INTERVALS = [1, 2, 3, 7, 14];

function view(r: {
  id: string; igAccountId: string; name: string; mode: string; instruction: string | null;
  imageData: string | null; intervalDays: number; timeJst: string; enabled: boolean;
  nextRunAt: Date; lastRunAt: Date | null;
}) {
  return {
    id: r.id,
    igAccountId: r.igAccountId,
    name: r.name,
    mode: r.mode,
    instruction: r.instruction,
    hasImage: !!r.imageData,
    intervalDays: r.intervalDays,
    timeJst: r.timeJst,
    enabled: r.enabled,
    nextRunAt: r.nextRunAt.toISOString(),
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();
  const items = await prisma.recurringStory.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ items: items.map(view) });
}

// 定期配信の登録。
// body: { igAccountId, name, mode: "ai"|"fixed", instruction?, dataUrl?, intervalDays, timeJst }
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    igAccountId?: string;
    name?: string;
    mode?: string;
    instruction?: string;
    dataUrl?: string;
    intervalDays?: number;
    timeJst?: string;
  };

  const account = body.igAccountId
    ? await prisma.igAccount.findFirst({ where: { id: body.igAccountId, organizationId: ctx.organizationId } })
    : await prisma.igAccount.findFirst({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "asc" },
      });
  if (!account) return Response.json({ error: "Instagramアカウントを先に連携してください" }, { status: 400 });

  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "名前を入力してください" }, { status: 400 });

  const mode = body.mode === "fixed" ? "fixed" : "ai";
  const instruction = (body.instruction ?? "").trim();
  if (mode === "ai" && !instruction) {
    return Response.json({ error: "生成指示を入力してください（例: 本日18時オープンの告知）" }, { status: 400 });
  }

  let imageData: string | null = null;
  if (mode === "fixed") {
    if (!body.dataUrl?.startsWith("data:image/")) {
      return Response.json({ error: "投稿する画像を選択してください" }, { status: 400 });
    }
    const comma = body.dataUrl.indexOf(",");
    const buf = Buffer.from(body.dataUrl.slice(comma + 1), "base64");
    if (buf.length > 15 * 1024 * 1024) return Response.json({ error: "画像は15MB以下にしてください" }, { status: 400 });
    const jpeg = await resizePlain(buf);
    imageData = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  }

  const intervalDays = ALLOWED_INTERVALS.includes(Number(body.intervalDays)) ? Number(body.intervalDays) : 1;

  let nextRunAt: Date;
  try {
    nextRunAt = nextOccurrenceJst(body.timeJst ?? "");
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "時刻が不正です" }, { status: 400 });
  }

  const created = await prisma.recurringStory.create({
    data: {
      organizationId: ctx.organizationId,
      igAccountId: account.id,
      name: name.slice(0, 50),
      mode,
      instruction: instruction || null,
      imageData,
      intervalDays,
      timeJst: (body.timeJst ?? "").trim(),
      nextRunAt,
    },
  });
  return Response.json({ ok: true, item: view(created) }, { status: 201 });
}
