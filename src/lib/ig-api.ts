// Instagram API with Instagram Login（プロアカウント直接ログイン方式）の薄いラッパー。
// Facebookページ連携が不要な graph.instagram.com 系のエンドポイントを使う。
// トークンは呼び出し側で lib/crypto により暗号化して保存する。

const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_GRAPH_BASE = "https://graph.instagram.com";
const IG_GRAPH_VERSION = "v23.0";

// ストーリーズ投稿に必要な権限
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export function igConfigured(): boolean {
  return !!(process.env.IG_APP_ID && process.env.IG_APP_SECRET);
}

function appCreds() {
  const appId = (process.env.IG_APP_ID ?? "").trim();
  const appSecret = (process.env.IG_APP_SECRET ?? "").trim();
  return { appId, appSecret };
}

// 連携開始URL（ビジネスログイン）
export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const { appId } = appCreds();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `${IG_AUTHORIZE_URL}?${params.toString()}`;
}

// 認可コード → 短期トークン（約1時間）
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; igUserId: string }> {
  const { appId, appSecret } = appCreds();
  const res = await fetch(IG_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!res.ok) throw new Error(`IG token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; user_id: string | number };
  return { accessToken: json.access_token, igUserId: String(json.user_id) };
}

// 短期トークン → 長期トークン（約60日）
export async function exchangeForLongLivedToken(
  shortToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const { appSecret } = appCreds();
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortToken,
  });
  const res = await fetch(`${IG_GRAPH_BASE}/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`IG long-lived exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

// 長期トークンの更新（発行から24時間経過後・失効前のみ可能）
export async function refreshLongLivedToken(
  longToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: longToken,
  });
  const res = await fetch(`${IG_GRAPH_BASE}/refresh_access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`IG token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

// ── 認証付き Graph API 呼び出し ──
async function igFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(
    `${IG_GRAPH_BASE}/${IG_GRAPH_VERSION}${path}${sep}access_token=${encodeURIComponent(token)}`,
    init
  );
  const body = await res.text();
  if (!res.ok) {
    // Meta のエラーは { error: { message, code, error_subcode } } 形式
    let message = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; code?: number } };
      if (parsed.error?.message) message = `${parsed.error.message} (code ${parsed.error.code})`;
    } catch {
      // 生テキストのまま
    }
    throw new Error(`IG API ${path.split("?")[0]} failed: ${res.status} ${message}`);
  }
  return JSON.parse(body) as T;
}

export interface IgMe {
  user_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
  followers_count?: number;
  media_count?: number;
}

// 認証ユーザー情報
export async function getMe(token: string): Promise<IgMe> {
  const me = await igFetch<IgMe & { id?: string }>(
    token,
    "/me?fields=user_id,username,name,profile_picture_url,account_type,followers_count,media_count"
  );
  return { ...me, user_id: String(me.user_id ?? me.id ?? "") };
}

// ── ストーリーズ投稿（2段階: コンテナ作成 → 公開） ──

export interface StoryMediaSource {
  imageUrl?: string; // 公開アクセス可能な JPEG のURL
  videoUrl?: string; // 公開アクセス可能な MP4/MOV のURL（3〜60秒）
}

// 1) ストーリーズ用メディアコンテナを作成。
export async function createStoryContainer(
  token: string,
  igUserId: string,
  media: StoryMediaSource
): Promise<string> {
  const params = new URLSearchParams({ media_type: "STORIES" });
  if (media.videoUrl) params.set("video_url", media.videoUrl);
  else if (media.imageUrl) params.set("image_url", media.imageUrl);
  else throw new Error("imageUrl または videoUrl が必要です");
  const json = await igFetch<{ id: string }>(token, `/${igUserId}/media?${params.toString()}`, {
    method: "POST",
  });
  return json.id;
}

// 2) コンテナの取り込み状況を確認（IGサーバーが画像をダウンロード/検証するまで数秒かかる）
export async function getContainerStatus(
  token: string,
  containerId: string
): Promise<{ statusCode: string; status?: string }> {
  const json = await igFetch<{ status_code?: string; status?: string }>(
    token,
    `/${containerId}?fields=status_code,status`
  );
  return { statusCode: json.status_code ?? "UNKNOWN", status: json.status };
}

// 3) コンテナを公開してメディアIDを得る
export async function publishContainer(
  token: string,
  igUserId: string,
  containerId: string
): Promise<string> {
  const params = new URLSearchParams({ creation_id: containerId });
  const json = await igFetch<{ id: string }>(
    token,
    `/${igUserId}/media_publish?${params.toString()}`,
    { method: "POST" }
  );
  return json.id;
}

// コンテナ作成 → FINISHED まで待機 → 公開、をまとめて行う。IG メディアIDを返す。
// 動画はサーバー側の変換処理が入るため待機を長めに取る。
export async function publishStory(
  token: string,
  igUserId: string,
  media: StoryMediaSource
): Promise<string> {
  const containerId = await createStoryContainer(token, igUserId, media);

  const waitMs = media.videoUrl ? 240_000 : 60_000;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const { statusCode, status } = await getContainerStatus(token, containerId);
    if (statusCode === "FINISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`メディアの取り込みに失敗しました: ${status ?? statusCode}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`メディアの取り込みがタイムアウトしました（${Math.round(waitMs / 1000)}秒）`);
    }
    await new Promise((r) => setTimeout(r, media.videoUrl ? 5_000 : 2_500));
  }

  return publishContainer(token, igUserId, containerId);
}

// ── 過去投稿の取得（メディアライブラリ「過去のIG投稿から再利用」用） ──

export interface IgMediaItem {
  id: string;
  mediaType: string; // IMAGE / VIDEO / CAROUSEL_ALBUM
  mediaUrl?: string; // CDN直リンク（署名付き・一定期間有効）
  thumbnailUrl?: string; // 動画のサムネイル
  caption?: string;
  timestamp?: string;
  permalink?: string;
}

// 連携アカウントの過去投稿一覧（新しい順・最大 limit 件）
export async function getUserMedia(token: string, igUserId: string, limit = 40): Promise<IgMediaItem[]> {
  const params = new URLSearchParams({
    fields: "id,media_type,media_url,thumbnail_url,caption,timestamp,permalink",
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });
  const json = await igFetch<{
    data?: Array<{
      id: string; media_type: string; media_url?: string; thumbnail_url?: string;
      caption?: string; timestamp?: string; permalink?: string;
    }>;
  }>(token, `/${igUserId}/media?${params.toString()}`);
  return (json.data ?? []).map((m) => ({
    id: m.id,
    mediaType: m.media_type,
    mediaUrl: m.media_url,
    thumbnailUrl: m.thumbnail_url,
    caption: m.caption,
    timestamp: m.timestamp,
    permalink: m.permalink,
  }));
}
