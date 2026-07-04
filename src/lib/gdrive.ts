// メディアライブラリ用の Google ドライブ連携（drive.readonly）。
// ログインと同じ Google OAuth クライアントを使い、別フローで追加同意を取る。
// googleapis パッケージは使わず REST を直接叩く（依存を増やさない）。

import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { DriveIntegration } from "@/generated/prisma/client";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function clientCreds() {
  return {
    clientId: (process.env.AUTH_GOOGLE_ID ?? "").trim(),
    clientSecret: (process.env.AUTH_GOOGLE_SECRET ?? "").trim(),
  };
}

export function driveConfigured(): boolean {
  const { clientId, clientSecret } = clientCreds();
  return !!(clientId && clientSecret);
}

export function buildDriveAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = clientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent", // refresh_token を確実に得る
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeDriveCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in,
  };
}

async function refreshDriveToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

// 復号済みアクセストークンを返す（期限切れ間近ならリフレッシュしてDB更新）。
export async function getDriveToken(integration: DriveIntegration): Promise<string | null> {
  const token = decryptSecret(integration.accessToken);
  const expiresAt = integration.tokenExpiresAt?.getTime() ?? 0;

  if (token && expiresAt > Date.now() + 60_000) return token;

  const refresh = integration.refreshToken ? decryptSecret(integration.refreshToken) : null;
  if (!refresh) return token; // リフレッシュ不能。現行トークンに賭ける

  try {
    const r = await refreshDriveToken(refresh);
    await prisma.driveIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: encryptSecret(r.accessToken),
        tokenExpiresAt: new Date(Date.now() + r.expiresIn * 1000),
        status: "connected",
      },
    });
    return r.accessToken;
  } catch (e) {
    console.error("Drive token refresh failed:", e);
    await prisma.driveIntegration.update({
      where: { id: integration.id },
      data: { status: "expired" },
    });
    return null;
  }
}

// 連携ユーザーのメールアドレス（表示用）
export async function getDriveUserEmail(token: string): Promise<string | null> {
  const res = await fetch(`${DRIVE_API}/about?fields=user(emailAddress)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { user?: { emailAddress?: string } };
  return json.user?.emailAddress ?? null;
}

// フォルダURL（または生ID）からフォルダIDを抽出
export function extractFolderId(input: string): string | null {
  const s = input.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  size?: number;
  durationMillis?: number; // 動画のみ
}

// フォルダのメタデータ（名前確認・存在検証）
export async function getFolder(token: string, folderId: string): Promise<{ id: string; name: string } | null> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { id: string; name: string; mimeType: string };
  return json.mimeType === "application/vnd.google-apps.folder" ? { id: json.id, name: json.name } : null;
}

// フォルダ内の画像/動画ファイル一覧（新しい順・最大100件）
export async function listMediaFiles(token: string, folderId: string): Promise<DriveFile[]> {
  const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,thumbnailLink,size,videoMediaMetadata(durationMillis))",
    orderBy: "createdTime desc",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive files.list failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    files?: Array<{
      id: string; name: string; mimeType: string; thumbnailLink?: string; size?: string;
      videoMediaMetadata?: { durationMillis?: string };
    }>;
  };
  return (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    thumbnailLink: f.thumbnailLink,
    size: f.size ? Number(f.size) : undefined,
    durationMillis: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) : undefined,
  }));
}

// ファイル本体の取得（画像はBuffer化に使う。動画はストリームのままプロキシへ）
export async function fetchDriveFile(token: string, fileId: string): Promise<Response> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

// 組織のドライブ連携（フォルダ設定済み）を取得。なければ null。
export async function driveIntegrationForOrg(organizationId: string): Promise<DriveIntegration | null> {
  return prisma.driveIntegration.findUnique({ where: { organizationId } });
}
