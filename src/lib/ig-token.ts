// IgAccount の暗号化トークンを復号し、必要なら長期トークンを自動リフレッシュして返す。

import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshLongLivedToken } from "@/lib/ig-api";
import type { IgAccount } from "@/generated/prisma/client";

// 期限まで10日を切っていたらリフレッシュする（長期トークンは約60日有効）
const REFRESH_BEFORE_MS = 10 * 24 * 60 * 60 * 1000;
// 発行/更新から24時間以内はリフレッシュ不可（Meta仕様）
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

// 復号済みアクセストークンを返す。期限が近ければリフレッシュしてDBも更新する。
// 復号不可・失効時は null（呼び出し側で再連携を促す）。
export async function getIgToken(account: IgAccount): Promise<string | null> {
  const token = decryptSecret(account.accessToken);
  if (!token) return null;

  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  const now = Date.now();

  if (expiresAt && expiresAt < now) {
    // 失効済み。リフレッシュは失効前しかできないため再連携が必要。
    await prisma.igAccount.update({
      where: { id: account.id },
      data: { status: "expired" },
    });
    return null;
  }

  const age = now - account.updatedAt.getTime();
  if (expiresAt && expiresAt - now < REFRESH_BEFORE_MS && age > MIN_AGE_MS) {
    try {
      const refreshed = await refreshLongLivedToken(token);
      await prisma.igAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptSecret(refreshed.accessToken),
          tokenExpiresAt: new Date(now + refreshed.expiresIn * 1000),
          status: "connected",
        },
      });
      return refreshed.accessToken;
    } catch (e) {
      console.error(`IG token refresh failed for @${account.username}:`, e);
      // リフレッシュ失敗でも現行トークンが生きていればそのまま使う
    }
  }

  return token;
}
