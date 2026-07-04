import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/auth-helpers";
import { encryptSecret } from "@/lib/crypto";
import { exchangeDriveCode, getDriveUserEmail } from "@/lib/gdrive";
import { appBaseUrl } from "@/lib/base-url";

// Google ドライブ連携のコールバック。トークンを暗号化保存する（フォルダは別途設定）。
export async function GET(req: NextRequest) {
  const base = appBaseUrl();
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(`${base}/login`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  if (error) return NextResponse.redirect(`${base}/?error=gdrive_denied`);

  const cookieStore = await cookies();
  const savedState = cookieStore.get("gd_os")?.value;
  cookieStore.delete("gd_os");
  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${base}/?error=gdrive_invalid_state`);
  }

  try {
    const tokens = await exchangeDriveCode(code, `${base}/api/gdrive/callback`);
    const email = await getDriveUserEmail(tokens.accessToken);

    const data = {
      googleEmail: email,
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      status: "connected",
    };
    await prisma.driveIntegration.upsert({
      where: { organizationId: ctx.organizationId },
      update: data,
      create: { organizationId: ctx.organizationId, ...data },
    });

    return NextResponse.redirect(`${base}/?connected=gdrive`);
  } catch (e) {
    console.error("gdrive callback failed:", e);
    const detail = encodeURIComponent((e instanceof Error ? e.message : "unknown").slice(0, 200));
    return NextResponse.redirect(`${base}/?error=gdrive_token_failed&detail=${detail}`);
  }
}
