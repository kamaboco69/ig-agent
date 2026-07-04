import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { driveConfigured, buildDriveAuthUrl } from "@/lib/gdrive";
import { appBaseUrl } from "@/lib/base-url";

// メディアライブラリ用 Google ドライブ連携（drive.readonly の追加同意）を開始する。
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const base = appBaseUrl();
  if (!driveConfigured()) {
    return NextResponse.redirect(`${base}/?error=gdrive_not_configured`);
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("gd_os", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.redirect(buildDriveAuthUrl(`${base}/api/gdrive/callback`, state));
}
