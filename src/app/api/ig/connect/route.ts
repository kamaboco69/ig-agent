import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";
import { igConfigured, buildAuthorizeUrl } from "@/lib/ig-api";
import { appBaseUrl } from "@/lib/base-url";

// Instagram ビジネスログイン（プロアカウント連携）を開始する。
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  const base = appBaseUrl();
  if (!igConfigured()) {
    return NextResponse.redirect(`${base}/?error=ig_not_configured`);
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("ig_os", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizeUrl(`${base}/api/ig/callback`, state));
}
