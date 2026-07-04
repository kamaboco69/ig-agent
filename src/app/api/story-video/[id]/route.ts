import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { driveIntegrationForOrg, getDriveToken, fetchDriveFile } from "@/lib/gdrive";

export const runtime = "nodejs";
export const maxDuration = 300;

// ドライブ動画のプロキシ配信。IG のメディア取り込み（video_url）が取得しに来る。
// story.videoToken による照合つき（IDだけでは再生不可）。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = req.nextUrl.searchParams.get("t") ?? "";

  const story = await prisma.story.findUnique({
    where: { id },
    select: { organizationId: true, videoSrc: true, videoToken: true },
  });
  if (!story?.videoSrc?.startsWith("drive:") || !story.videoToken || story.videoToken !== t) {
    return new Response("not found", { status: 404 });
  }

  const integration = await driveIntegrationForOrg(story.organizationId);
  if (!integration) return new Response("drive not connected", { status: 404 });
  const token = await getDriveToken(integration);
  if (!token) return new Response("drive token expired", { status: 502 });

  const fileId = story.videoSrc.slice("drive:".length);
  try {
    const upstream = await fetchDriveFile(token, fileId);
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "video/mp4");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    headers.set("Cache-Control", "private, max-age=3600");
    return new Response(upstream.body, { headers });
  } catch (e) {
    console.error("story-video proxy failed:", e);
    return new Response("upstream error", { status: 502 });
  }
}
