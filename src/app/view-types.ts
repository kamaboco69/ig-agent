// 画面間で共有するビュー型と表示用定数。

export interface AccountView {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  accountType: string | null;
  status: string;
  tokenExpiresAt: string | null;
  autoStoryEnabled: boolean;
  autoStoryTimes: string | null;
  autoStoryTheme: string | null;
  autoStoryStyle: string;
  autoStorySource: string;
  toneProfile: string | null;
  toneProfileAt: string | null;
}

export interface StoryView {
  id: string;
  igAccountId: string;
  username: string;
  concept: string | null;
  overlayTitle: string | null;
  overlaySub: string | null;
  status: string;
  source: string;
  mediaType: string;
  sourceKind: string;
  scheduledAt: string | null;
  postedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  imageUrl: string;
}

export interface DriveView {
  connected: boolean;
  googleEmail: string | null;
  folderId: string | null;
  folderName: string | null;
}

export interface RecurringView {
  id: string;
  igAccountId: string;
  username: string;
  name: string;
  mode: string;
  instruction: string | null;
  hasImage: boolean;
  driveFolderName: string | null;
  intervalDays: number;
  timeJst: string;
  enabled: boolean;
  nextRunAt: string;
}

export const STYLE_OPTIONS = [
  { value: "auto", label: "おまかせ" },
  { value: "photo", label: "写真風" },
  { value: "illustration", label: "イラスト" },
  { value: "minimal", label: "ミニマル" },
  { value: "pop", label: "ポップ" },
];

export const AUTO_SOURCE_OPTIONS = [
  { value: "ai", label: "AI生成のみ" },
  { value: "library", label: "ドライブ素材から" },
  { value: "mix", label: "AIと素材を交互に" },
];

export const INTERVAL_OPTIONS = [
  { value: 1, label: "毎日" },
  { value: 2, label: "2日に1回" },
  { value: 3, label: "3日に1回" },
  { value: 7, label: "毎週" },
  { value: 14, label: "2週に1回" },
];

export const intervalLabel = (d: number) =>
  INTERVAL_OPTIONS.find((o) => o.value === d)?.label ?? `${d}日毎`;

export const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "bg-neutral-700 text-gray-200" },
  scheduled: { label: "予約済み", cls: "bg-sky-600/80 text-white" },
  posting: { label: "投稿中…", cls: "bg-amber-500/90 text-black" },
  posted: { label: "投稿済み", cls: "bg-emerald-600/90 text-white" },
  failed: { label: "失敗", cls: "bg-red-600/90 text-white" },
};

export const ERROR_MESSAGES: Record<string, string> = {
  ig_not_configured: "Instagram連携が未設定です（IG_APP_ID / IG_APP_SECRET）",
  ig_denied: "Instagram連携がキャンセルされました",
  ig_invalid_state: "連携セッションが無効です。もう一度お試しください",
  ig_token_failed: "Instagram連携に失敗しました",
  gdrive_not_configured: "Googleドライブ連携が未設定です",
  gdrive_denied: "Googleドライブ連携がキャンセルされました",
  gdrive_invalid_state: "連携セッションが無効です。もう一度お試しください",
  gdrive_token_failed: "Googleドライブ連携に失敗しました",
};
