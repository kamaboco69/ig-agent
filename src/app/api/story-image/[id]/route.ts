import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// ストーリーズ画像の公開配信。IG サーバーのメディア取り込み（image_url）と
// 画面のプレビューの両方で使う。ID は cuid（推測不可）なので認証は掛けない。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const story = await prisma.story.findUnique({
    where: { id },
    select: { imageData: true },
  });
  if (!story?.imageData) return new Response("not found", { status: 404 });

  const comma = story.imageData.indexOf(",");
  if (comma === -1) return new Response("broken image", { status: 500 });
  const mime = story.imageData.slice(5, story.imageData.indexOf(";")) || "image/jpeg";
  const buffer = Buffer.from(story.imageData.slice(comma + 1), "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
