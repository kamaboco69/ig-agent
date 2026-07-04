import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/auth-helpers";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, exchangeForLongLivedToken, getMe, IG_SCOPES } from "@/lib/ig-api";
import { appBaseUrl } from "@/lib/base-url";

// Instagram ビジネスログインのコールバック。
// 認可コード → 短期トークン → 長期トークン（約60日）→ アカウント情報取得 → 暗号化保存。
export async function GET(req: NextRequest) {
  const base = appBaseUrl();
  const homeUrl = `${base}/`;

  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(`${base}/login`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${homeUrl}?error=ig_denied`);
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("ig_os")?.value;
  cookieStore.delete("ig_os");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${homeUrl}?error=ig_invalid_state`);
  }

  try {
    const { accessToken: shortToken } = await exchangeCode(code, `${base}/api/ig/callback`);
    const longLived = await exchangeForLongLivedToken(shortToken);
    const me = await getMe(longLived.accessToken);
    if (!me.user_id || !me.username) {
      throw new Error("アカウント情報を取得できませんでした");
    }

    const data = {
      username: me.username,
      name: me.name ?? null,
      avatarUrl: me.profile_picture_url ?? null,
      accountType: me.account_type ?? null,
      accessToken: encryptSecret(longLived.accessToken),
      tokenExpiresAt: new Date(Date.now() + longLived.expiresIn * 1000),
      scope: IG_SCOPES.join(","),
      status: "connected",
    };

    await prisma.igAccount.upsert({
      where: {
        organizationId_igUserId: { organizationId: ctx.organizationId, igUserId: me.user_id },
      },
      update: data,
      create: { organizationId: ctx.organizationId, igUserId: me.user_id, ...data },
    });

    return NextResponse.redirect(`${homeUrl}?connected=ig`);
  } catch (e) {
    console.error("IG callback failed:", e);
    const detail = encodeURIComponent((e instanceof Error ? e.message : "unknown").slice(0, 200));
    return NextResponse.redirect(`${homeUrl}?error=ig_token_failed&detail=${detail}`);
  }
}
