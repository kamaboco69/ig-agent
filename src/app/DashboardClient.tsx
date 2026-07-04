"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BookOpen,
  CalendarClock,
  Camera,
  Check,
  Film,
  FolderOpen,
  HardDriveUpload,
  History,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Repeat,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

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

export interface RecurringView {
  id: string;
  igAccountId: string;
  username: string;
  name: string;
  mode: string;
  instruction: string | null;
  hasImage: boolean;
  intervalDays: number;
  timeJst: string;
  enabled: boolean;
  nextRunAt: string;
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

interface DriveFileView {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  durationMillis?: number;
}

interface IgMediaView {
  id: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  timestamp?: string;
}

const STYLE_OPTIONS = [
  { value: "auto", label: "おまかせ" },
  { value: "photo", label: "写真風" },
  { value: "illustration", label: "イラスト" },
  { value: "minimal", label: "ミニマル" },
  { value: "pop", label: "ポップ" },
];

const AUTO_SOURCE_OPTIONS = [
  { value: "ai", label: "AI生成のみ" },
  { value: "library", label: "ドライブ素材から" },
  { value: "mix", label: "AIと素材を交互に" },
];

const INTERVAL_OPTIONS = [
  { value: 1, label: "毎日" },
  { value: 2, label: "2日に1回" },
  { value: 3, label: "3日に1回" },
  { value: 7, label: "毎週" },
  { value: 14, label: "2週に1回" },
];

const intervalLabel = (d: number) => INTERVAL_OPTIONS.find((o) => o.value === d)?.label ?? `${d}日毎`;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "bg-neutral-700 text-gray-200" },
  scheduled: { label: "予約済み", cls: "bg-sky-600/80 text-white" },
  posting: { label: "投稿中…", cls: "bg-amber-500/90 text-black" },
  posted: { label: "投稿済み", cls: "bg-emerald-600/90 text-white" },
  failed: { label: "失敗", cls: "bg-red-600/90 text-white" },
};

const ERROR_MESSAGES: Record<string, string> = {
  ig_not_configured: "Instagram連携が未設定です（IG_APP_ID / IG_APP_SECRET）",
  ig_denied: "Instagram連携がキャンセルされました",
  ig_invalid_state: "連携セッションが無効です。もう一度お試しください",
  ig_token_failed: "Instagram連携に失敗しました",
  gdrive_not_configured: "Googleドライブ連携が未設定です",
  gdrive_denied: "Googleドライブ連携がキャンセルされました",
  gdrive_invalid_state: "連携セッションが無効です。もう一度お試しください",
  gdrive_token_failed: "Googleドライブ連携に失敗しました",
};

export function DashboardClient({
  configured,
  initialAccounts,
  initialStories,
  initialRecurring,
  drive,
}: {
  configured: boolean;
  initialAccounts: AccountView[];
  initialStories: StoryView[];
  initialRecurring: RecurringView[];
  drive: DriveView;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [accounts] = useState(initialAccounts);
  const [stories, setStories] = useState(initialStories);

  // 連携コールバックのフィードバック（マウント時のURLパラメータから初期状態を決める）
  const paramError = params?.get("error") ?? null;
  const paramConnected = params?.get("connected") ?? null;
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    if (paramError) {
      const detail = params?.get("detail");
      return { kind: "error", text: `${ERROR_MESSAGES[paramError] ?? paramError}${detail ? `: ${detail}` : ""}` };
    }
    if (paramConnected === "ig") return { kind: "ok", text: "Instagramアカウントを連携しました" };
    if (paramConnected === "gdrive") {
      return { kind: "ok", text: "Googleドライブを連携しました。素材フォルダを設定してください" };
    }
    return null;
  });

  // 作成フォーム共通
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [createMode, setCreateMode] = useState<"ai" | "media">(paramConnected === "gdrive" ? "media" : "ai");

  // AIおまかせ
  const [style, setStyle] = useState(initialAccounts[0]?.autoStoryStyle ?? "auto");

  // 素材から作成
  const [mediaTab, setMediaTab] = useState<"upload" | "drive" | "ig">(
    paramConnected === "gdrive" ? "drive" : "upload"
  );
  const [overlay, setOverlay] = useState(true);
  const [upload, setUpload] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileView[] | null>(null);
  const [driveFolder, setDriveFolder] = useState<{ id: string; name: string } | null>(
    drive.folderId ? { id: drive.folderId, name: drive.folderName ?? "" } : null
  );
  const [driveLoading, setDriveLoading] = useState(false);
  const [folderUrl, setFolderUrl] = useState("");
  const [editFolder, setEditFolder] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState<DriveFileView | null>(null);
  const [igItems, setIgItems] = useState<IgMediaView[] | null>(null);
  const [igLoading, setIgLoading] = useState(false);
  const [selectedIg, setSelectedIg] = useState<IgMediaView | null>(null);

  // 選択中ストーリーズ（詳細パネル）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);

  // 定期配信
  const [recurring, setRecurring] = useState(initialRecurring);
  const [showRecurringForm, setShowRecurringForm] = useState(initialRecurring.length === 0);
  const [recName, setRecName] = useState("");
  const [recMode, setRecMode] = useState<"ai" | "fixed">("ai");
  const [recInstruction, setRecInstruction] = useState("");
  const [recImage, setRecImage] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [recInterval, setRecInterval] = useState(1);
  const [recTime, setRecTime] = useState("18:00");
  const [recSaving, setRecSaving] = useState(false);

  const selected = useMemo(
    () => stories.find((s) => s.id === selectedId) ?? null,
    [stories, selectedId]
  );

  const selectedIsVideo =
    (mediaTab === "drive" && selectedDrive?.mimeType.startsWith("video/")) ||
    (mediaTab === "ig" && selectedIg?.mediaType === "VIDEO");

  useEffect(() => {
    if (!paramError && !paramConnected) return;
    router.replace("/");
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 6000);
  }

  async function refreshStories() {
    const res = await fetch("/api/stories");
    if (res.ok) {
      const json = (await res.json()) as { stories: (Omit<StoryView, "username"> & { igAccount: { username: string } })[] };
      setStories(json.stories.map((s) => ({ ...s, username: s.igAccount.username })));
    }
  }

  const loadDriveFiles = useCallback(async () => {
    setDriveLoading(true);
    try {
      const res = await fetch("/api/gdrive/files");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "一覧の取得に失敗しました");
      setDriveFolder(json.folder ?? null);
      setDriveFiles(json.files ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ドライブの読み込みに失敗しました");
      setDriveFiles([]);
    } finally {
      setDriveLoading(false);
    }
  }, []);

  const loadIgMedia = useCallback(async (forAccountId: string) => {
    setIgLoading(true);
    try {
      const res = await fetch(`/api/ig/media?accountId=${encodeURIComponent(forAccountId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "過去投稿の取得に失敗しました");
      setIgItems(json.items ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "過去投稿の取得に失敗しました");
      setIgItems([]);
    } finally {
      setIgLoading(false);
    }
  }, []);

  // 素材タブを開いたときの遅延読み込み（クリック起点。effect内のsetStateを避ける）
  function openMediaTab(tab: "upload" | "drive" | "ig") {
    setMediaTab(tab);
    if (tab === "drive" && drive.connected && driveFolder && driveFiles === null) void loadDriveFiles();
    if (tab === "ig" && igItems === null) void loadIgMedia(accountId);
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("error", "画像ファイルを選択してください（動画はドライブ/過去投稿から使えます）");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast("error", "画像は15MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUpload({ dataUrl: String(reader.result), fileName: file.name });
    reader.readAsDataURL(file);
  }

  async function saveFolder() {
    if (!folderUrl.trim()) return;
    setDriveLoading(true);
    try {
      const res = await fetch("/api/gdrive/folder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "フォルダの設定に失敗しました");
      setDriveFolder(json.folder);
      setEditFolder(false);
      setFolderUrl("");
      setDriveFiles(null);
      await loadDriveFiles();
      showToast("ok", `素材フォルダを「${json.folder.name}」に設定しました`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "フォルダの設定に失敗しました");
      setDriveLoading(false);
    }
  }

  async function generateAi() {
    if (!accountId) return showToast("error", "Instagramアカウントを先に連携してください");
    setGenerating(true);
    try {
      const res = await fetch("/api/stories/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igAccountId: accountId, instruction, style }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "生成に失敗しました");
      setInstruction("");
      await refreshStories();
      setSelectedId(json.story.id);
      showToast("ok", "ストーリーズを作成しました。プレビューを確認して投稿してください");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  async function createFromMedia() {
    if (!accountId) return showToast("error", "Instagramアカウントを先に連携してください");

    let body: Record<string, unknown>;
    if (mediaTab === "upload") {
      if (!upload) return showToast("error", "画像を選択してください");
      body = { source: "upload", dataUrl: upload.dataUrl, fileName: upload.fileName };
    } else if (mediaTab === "drive") {
      if (!selectedDrive) return showToast("error", "ファイルを選択してください");
      body = {
        source: "library",
        fileId: selectedDrive.id,
        mimeType: selectedDrive.mimeType,
        fileName: selectedDrive.name,
      };
    } else {
      if (!selectedIg) return showToast("error", "投稿を選択してください");
      body = {
        source: "ig",
        igMediaId: selectedIg.id,
        mediaUrl: selectedIg.mediaUrl,
        mediaTypeHint: selectedIg.mediaType,
        caption: selectedIg.caption,
      };
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/stories/from-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, igAccountId: accountId, overlay: overlay && !selectedIsVideo, instruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setInstruction("");
      setUpload(null);
      setSelectedDrive(null);
      setSelectedIg(null);
      await refreshStories();
      setSelectedId(json.story.id);
      showToast("ok", json.story.mediaType === "video"
        ? "動画ストーリーズを準備しました。プレビューはサムネイル表示です"
        : "ストーリーズを作成しました。プレビューを確認して投稿してください");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  async function publishNow(id: string) {
    setBusy(true);
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, status: "posting" } : s)));
    try {
      const res = await fetch(`/api/stories/${id}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "投稿に失敗しました");
      showToast("ok", "ストーリーズを投稿しました 🎉");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "投稿に失敗しました");
    } finally {
      await refreshStories();
      setBusy(false);
    }
  }

  async function schedule(id: string) {
    if (!scheduleAt) return showToast("error", "予約日時を選択してください");
    setBusy(true);
    try {
      const res = await fetch(`/api/stories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(scheduleAt).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "予約に失敗しました");
      await refreshStories();
      showToast("ok", "予約しました。時刻になると自動投稿されます");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "予約に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function unschedule(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/stories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: null }),
      });
      await refreshStories();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("このストーリーズを削除しますか？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stories/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "削除に失敗しました");
      }
      if (selectedId === id) setSelectedId(null);
      await refreshStories();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const fmtDuration = (ms?: number) => {
    if (!ms) return "";
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // ── 定期配信 ──
  function onRecFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("error", "画像ファイルを選択してください");
    if (file.size > 15 * 1024 * 1024) return showToast("error", "画像は15MB以下にしてください");
    const reader = new FileReader();
    reader.onload = () => setRecImage({ dataUrl: String(reader.result), fileName: file.name });
    reader.readAsDataURL(file);
  }

  async function addRecurring() {
    if (!accountId) return showToast("error", "Instagramアカウントを先に連携してください");
    setRecSaving(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          igAccountId: accountId,
          name: recName,
          mode: recMode,
          instruction: recInstruction,
          dataUrl: recImage?.dataUrl,
          intervalDays: recInterval,
          timeJst: recTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "登録に失敗しました");
      const username = accounts.find((a) => a.id === accountId)?.username ?? "";
      setRecurring((prev) => [...prev, { ...json.item, username }]);
      setRecName("");
      setRecInstruction("");
      setRecImage(null);
      setShowRecurringForm(false);
      showToast("ok", "定期配信を登録しました");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setRecSaving(false);
    }
  }

  async function toggleRecurring(id: string, enabled: boolean) {
    setRecurring((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    const res = await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      setRecurring((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
      showToast("error", "更新に失敗しました");
    }
  }

  async function deleteRecurring(id: string) {
    if (!confirm("この定期配信を削除しますか？")) return;
    const res = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setRecurring((prev) => prev.filter((r) => r.id !== id));
    } else {
      showToast("error", "削除に失敗しました");
    }
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center text-white font-black">
            IG
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">IG Agent</h1>
            <p className="text-gray-500 text-xs">Instagram ストーリーズ自動運用</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <LogOut size={15} /> ログアウト
        </button>
      </header>

      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* アカウント連携 */}
      <section className="mb-8">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <Camera size={16} className="text-pink-400" /> 連携アカウント
        </h2>

        {accounts.length === 0 ? (
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center">
            <p className="text-gray-300 font-medium">Instagramプロアカウントを連携しましょう</p>
            <p className="text-gray-500 text-sm mt-1">
              ビジネス/クリエイターアカウントでログインすると、ストーリーズの自動作成・自動投稿が使えます
            </p>
            {configured ? (
              <a
                href="/api/ig/connect"
                className="inline-flex items-center gap-2 mt-4 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 hover:opacity-90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-opacity"
              >
                <Plus size={16} /> Instagramを連携する
              </a>
            ) : (
              <p className="text-amber-400 text-sm mt-4">
                IG_APP_ID / IG_APP_SECRET が未設定です（Meta開発者アプリの作成が必要）
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} driveConnected={drive.connected && !!driveFolder} onChanged={() => router.refresh()} onToast={showToast} />
            ))}
            {configured && (
              <a href="/api/ig/connect" className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300 text-sm">
                <Plus size={14} /> 別のアカウントを連携
              </a>
            )}
          </div>
        )}
      </section>

      {/* ストーリーズ作成 */}
      <section className="mb-8">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-pink-400" /> ストーリーズを作成
        </h2>
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
          {/* モード切替 */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCreateMode("ai")}
              className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
                createMode === "ai"
                  ? "border-pink-500 bg-pink-500/10 text-white"
                  : "border-neutral-700 text-gray-400 hover:text-white"
              }`}
            >
              <Sparkles size={13} className="inline mr-1.5 -mt-0.5" />AIおまかせ
            </button>
            <button
              onClick={() => setCreateMode("media")}
              className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
                createMode === "media"
                  ? "border-pink-500 bg-pink-500/10 text-white"
                  : "border-neutral-700 text-gray-400 hover:text-white"
              }`}
            >
              <Film size={13} className="inline mr-1.5 -mt-0.5" />写真・動画から作成
            </button>
            {accounts.length > 1 && (
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setSelectedIg(null);
                  setIgItems(null);
                  if (createMode === "media" && mediaTab === "ig") void loadIgMedia(e.target.value);
                }}
                className="ml-auto bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>@{a.username}</option>
                ))}
              </select>
            )}
          </div>

          {createMode === "ai" ? (
            <>
              <div className="flex flex-col md:flex-row gap-3">
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
                >
                  {STYLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>背景: {o.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={2}
                placeholder="今回のテーマ・指示（任意）例: 新メニューの告知 / 今日の営業時間 / フォロワーへの質問"
                className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
              />
              <button
                onClick={generateAi}
                disabled={generating || accounts.length === 0}
                className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generating ? "作成中…（30秒ほどかかります）" : "AIでストーリーズを作成"}
              </button>
            </>
          ) : (
            <>
              {/* 素材タブ */}
              <div className="flex gap-2 border-b border-neutral-800 pb-3">
                {([
                  { key: "upload", label: "アップロード", icon: HardDriveUpload },
                  { key: "drive", label: "Googleドライブ", icon: FolderOpen },
                  { key: "ig", label: "過去のIG投稿", icon: History },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => openMediaTab(t.key)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      mediaTab === t.key
                        ? "border-pink-500 bg-pink-500/10 text-white"
                        : "border-neutral-700 text-gray-400 hover:text-white"
                    }`}
                  >
                    <t.icon size={12} /> {t.label}
                  </button>
                ))}
              </div>

              {/* アップロード */}
              {mediaTab === "upload" && (
                <div className="space-y-3">
                  <label className="block border border-dashed border-neutral-700 hover:border-pink-500 rounded-xl p-6 text-center cursor-pointer transition-colors">
                    <input type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
                    {upload ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={upload.dataUrl} alt={upload.fileName} className="max-h-48 mx-auto rounded-lg" />
                    ) : (
                      <span className="text-gray-500 text-sm">クリックして画像を選択（JPG/PNG・15MBまで）<br />
                        <span className="text-xs">動画はGoogleドライブまたは過去のIG投稿から使えます</span>
                      </span>
                    )}
                  </label>
                </div>
              )}

              {/* Googleドライブ */}
              {mediaTab === "drive" && (
                <div className="space-y-3">
                  {!drive.connected ? (
                    <div className="text-center py-4">
                      <p className="text-gray-400 text-sm mb-3">
                        Googleドライブを連携すると、指定フォルダの写真・動画を素材として使えます
                      </p>
                      <a
                        href="/api/gdrive/connect"
                        className="inline-flex items-center gap-2 bg-white text-gray-800 hover:bg-gray-100 text-sm font-semibold px-4 py-2 rounded-lg"
                      >
                        <FolderOpen size={15} /> Googleドライブを連携
                      </a>
                    </div>
                  ) : !driveFolder || editFolder ? (
                    <div className="space-y-2">
                      <p className="text-gray-400 text-xs">
                        素材フォルダのURLを貼り付けてください（ドライブでフォルダを開いたときのアドレス）
                        {drive.googleEmail && <span className="ml-2 text-gray-600">連携中: {drive.googleEmail}</span>}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={folderUrl}
                          onChange={(e) => setFolderUrl(e.target.value)}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="flex-1 bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                        />
                        <button
                          onClick={saveFolder}
                          disabled={driveLoading || !folderUrl.trim()}
                          className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                        >
                          {driveLoading ? <Loader2 size={14} className="animate-spin" /> : "設定"}
                        </button>
                        {editFolder && (
                          <button onClick={() => setEditFolder(false)} className="text-gray-500 text-sm px-2">キャンセル</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5"><FolderOpen size={13} className="text-pink-400" /> {driveFolder.name}</span>
                        <button onClick={() => setEditFolder(true)} className="text-gray-600 hover:text-white">フォルダ変更</button>
                        <button onClick={() => { setDriveFiles(null); void loadDriveFiles(); }} className="flex items-center gap-1 text-gray-600 hover:text-white">
                          <RefreshCw size={11} /> 再読込
                        </button>
                      </div>
                      {driveLoading ? (
                        <p className="text-gray-500 text-sm py-4 text-center"><Loader2 size={16} className="animate-spin inline mr-2" />読み込み中…</p>
                      ) : (driveFiles ?? []).length === 0 ? (
                        <p className="text-gray-600 text-sm py-4 text-center">フォルダに画像・動画がありません</p>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-64 overflow-y-auto pr-1">
                          {(driveFiles ?? []).map((f) => (
                            <button
                              key={f.id}
                              onClick={() => setSelectedDrive(selectedDrive?.id === f.id ? null : f)}
                              title={f.name}
                              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-neutral-900 ${
                                selectedDrive?.id === f.id ? "border-pink-500" : "border-transparent hover:border-neutral-600"
                              }`}
                            >
                              {f.thumbnailLink ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.thumbnailLink} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="absolute inset-0 grid place-items-center text-gray-600 text-[10px] p-1 break-all">{f.name}</span>
                              )}
                              {f.mimeType.startsWith("video/") && (
                                <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-semibold px-1 rounded flex items-center gap-0.5">
                                  <Film size={9} />{fmtDuration(f.durationMillis)}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 過去のIG投稿 */}
              {mediaTab === "ig" && (
                <div className="space-y-3">
                  {igLoading ? (
                    <p className="text-gray-500 text-sm py-4 text-center"><Loader2 size={16} className="animate-spin inline mr-2" />読み込み中…</p>
                  ) : (igItems ?? []).length === 0 ? (
                    <p className="text-gray-600 text-sm py-4 text-center">過去の投稿が見つかりません</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-64 overflow-y-auto pr-1">
                      {(igItems ?? []).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedIg(selectedIg?.id === m.id ? null : m)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-neutral-900 ${
                            selectedIg?.id === m.id ? "border-pink-500" : "border-transparent hover:border-neutral-600"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.mediaType === "VIDEO" ? (m.thumbnailUrl ?? m.mediaUrl) : m.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          {m.mediaType === "VIDEO" && (
                            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-semibold px-1 rounded flex items-center gap-0.5">
                              <Film size={9} />動画
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 共通オプション */}
              <label className={`flex items-center gap-2.5 ${selectedIsVideo ? "opacity-40" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={overlay && !selectedIsVideo}
                  disabled={selectedIsVideo}
                  onChange={(e) => setOverlay(e.target.checked)}
                  className="w-4 h-4 accent-pink-500"
                />
                <span className="text-sm text-white">
                  AIがコピー（文字）を考えて画像に載せる
                  {selectedIsVideo && <span className="text-gray-500 text-xs ml-2">※動画はそのまま投稿されます</span>}
                </span>
              </label>
              {overlay && !selectedIsVideo && (
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={2}
                  placeholder="コピーの方向性（任意）例: 新商品の入荷告知として / 週末セールの案内"
                  className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
                />
              )}
              <button
                onClick={createFromMedia}
                disabled={generating || accounts.length === 0}
                className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {generating ? "作成中…" : "この素材でストーリーズを作成"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* 定期配信 */}
      <section className="mb-8">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <Repeat size={16} className="text-pink-400" /> 定期配信
        </h2>
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
          <p className="text-gray-500 text-xs">
            「本日18時オープン」のような繰り返し投稿を登録すると、設定した間隔・時刻で自動投稿します。
            AI生成モードはコピーが毎回少しずつ変わるのでマンネリしません。
          </p>

          {recurring.length > 0 && (
            <div className="space-y-2">
              {recurring.map((r) => (
                <div key={r.id} className="flex items-center gap-3 bg-black/40 border border-neutral-800 rounded-lg px-3 py-2.5">
                  <button
                    onClick={() => toggleRecurring(r.id, !r.enabled)}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-none ${r.enabled ? "bg-pink-600" : "bg-neutral-700"}`}
                    title={r.enabled ? "有効（クリックで停止）" : "停止中（クリックで再開）"}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.enabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{r.name}</p>
                    <p className="text-gray-500 text-xs truncate">
                      @{r.username}・{r.mode === "fixed" ? "固定画像" : "AI生成"}・{intervalLabel(r.intervalDays)} {r.timeJst}
                      {r.enabled && (
                        <span className="ml-2 text-sky-400">
                          次回 {new Date(r.nextRunAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => deleteRecurring(r.id)} className="text-gray-600 hover:text-red-400 flex-none">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showRecurringForm ? (
            <div className="space-y-3 pt-2 border-t border-neutral-800">
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  placeholder="名前（例: 開店告知）"
                  className="bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                />
                <div className="flex gap-2 items-center">
                  <select
                    value={recInterval}
                    onChange={(e) => setRecInterval(Number(e.target.value))}
                    className="flex-1 bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
                  >
                    {INTERVAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={recTime}
                    onChange={(e) => setRecTime(e.target.value)}
                    className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 [color-scheme:dark]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {(["ai", "fixed"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRecMode(m)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      recMode === m ? "border-pink-500 bg-pink-500/10 text-white" : "border-neutral-700 text-gray-400 hover:text-white"
                    }`}
                  >
                    {m === "ai" ? "AIで毎回生成（コピー日替わり）" : "登録画像をそのまま投稿"}
                  </button>
                ))}
              </div>
              {recMode === "ai" ? (
                <textarea
                  value={recInstruction}
                  onChange={(e) => setRecInstruction(e.target.value)}
                  rows={2}
                  placeholder="生成指示（例: 本日18時オープンの告知。今日のおすすめを一言添えて来店を促す）"
                  className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
                />
              ) : (
                <label className="block border border-dashed border-neutral-700 hover:border-pink-500 rounded-xl p-4 text-center cursor-pointer transition-colors">
                  <input type="file" accept="image/*" className="hidden" onChange={onRecFileSelected} />
                  {recImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={recImage.dataUrl} alt={recImage.fileName} className="max-h-32 mx-auto rounded-lg" />
                  ) : (
                    <span className="text-gray-500 text-sm">毎回投稿する画像を選択</span>
                  )}
                </label>
              )}
              <div className="flex gap-2">
                <button
                  onClick={addRecurring}
                  disabled={recSaving || accounts.length === 0}
                  className="flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {recSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  登録
                </button>
                {recurring.length > 0 && (
                  <button onClick={() => setShowRecurringForm(false)} className="text-gray-500 text-sm px-2">
                    キャンセル
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowRecurringForm(true)}
              className="flex items-center gap-1.5 text-pink-400 hover:text-pink-300 text-sm"
            >
              <Plus size={14} /> 定期配信を追加
            </button>
          )}
        </div>
      </section>

      {/* 詳細パネル */}
      {selected && (
        <section className="mb-8">
          <div className="bg-neutral-950 border border-pink-500/40 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">プレビュー</h3>
              <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-5">
              <div className="relative w-full max-w-[240px] mx-auto md:mx-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.imageUrl}
                  alt={selected.overlayTitle ?? "story"}
                  className="w-full aspect-[9/16] object-cover rounded-xl border border-neutral-800"
                />
                {selected.mediaType === "video" && (
                  <span className="absolute top-2 right-2 bg-black/70 text-white text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                    <Film size={11} /> 動画
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[selected.status]?.cls ?? ""}`}>
                    {STATUS_BADGE[selected.status]?.label ?? selected.status}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">@{selected.username}</span>
                  {selected.source === "auto" && <span className="text-gray-500 text-xs ml-2">（自動運用で生成）</span>}
                  {selected.mediaType === "video" && (
                    <span className="text-gray-500 text-xs ml-2">動画（プレビューはサムネイル）</span>
                  )}
                </div>
                {selected.overlayTitle && <p className="text-white font-bold">{selected.overlayTitle}</p>}
                {selected.overlaySub && <p className="text-gray-300 text-sm">{selected.overlaySub}</p>}
                {selected.concept && <p className="text-gray-500 text-xs leading-relaxed">狙い: {selected.concept}</p>}
                {selected.errorMessage && <p className="text-red-400 text-xs break-all">エラー: {selected.errorMessage}</p>}
                {selected.scheduledAt && selected.status === "scheduled" && (
                  <p className="text-sky-400 text-sm flex items-center gap-1.5">
                    <CalendarClock size={14} />
                    {new Date(selected.scheduledAt).toLocaleString("ja-JP")} に投稿予定
                  </p>
                )}

                {(selected.status === "draft" || selected.status === "failed" || selected.status === "scheduled") && (
                  <div className="pt-2 space-y-3 border-t border-neutral-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => publishNow(selected.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                      >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        今すぐ投稿
                      </button>
                      {selected.status === "scheduled" && (
                        <button onClick={() => unschedule(selected.id)} disabled={busy} className="text-gray-400 hover:text-white text-sm px-3 py-2">
                          予約を解除
                        </button>
                      )}
                      <button onClick={() => remove(selected.id)} disabled={busy} className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm px-3 py-2">
                        <Trash2 size={14} /> 削除
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 [color-scheme:dark]"
                      />
                      <button
                        onClick={() => schedule(selected.id)}
                        disabled={busy || !scheduleAt}
                        className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                      >
                        <CalendarClock size={14} /> 予約する
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ストーリーズ一覧 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider">ストーリーズ</h2>
          <button onClick={refreshStories} className="flex items-center gap-1 text-gray-500 hover:text-white text-xs">
            <RefreshCw size={12} /> 更新
          </button>
        </div>
        {stories.length === 0 ? (
          <p className="text-gray-600 text-sm">まだストーリーズがありません。上のフォームから作成できます。</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {stories.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`relative aspect-[9/16] rounded-xl overflow-hidden border transition-colors text-left ${
                  selectedId === s.id ? "border-pink-500" : "border-neutral-800 hover:border-neutral-600"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.imageUrl} alt={s.overlayTitle ?? "story"} className="w-full h-full object-cover" />
                <span className={`absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[s.status]?.cls ?? ""}`}>
                  {STATUS_BADGE[s.status]?.label ?? s.status}
                </span>
                {s.mediaType === "video" && (
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Film size={9} /> 動画
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// アカウントカード＋オートパイロット設定
function AccountCard({
  account,
  driveConnected,
  onChanged,
  onToast,
}: {
  account: AccountView;
  driveConnected: boolean;
  onChanged: () => void;
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(account.autoStoryEnabled);
  const [times, setTimes] = useState(account.autoStoryTimes ?? "");
  const [theme, setTheme] = useState(account.autoStoryTheme ?? "");
  const [styleValue, setStyleValue] = useState(account.autoStoryStyle);
  const [sourceValue, setSourceValue] = useState(account.autoStorySource);
  const [saving, setSaving] = useState(false);
  const [tone, setTone] = useState<{ profile: string | null; at: string | null }>({
    profile: account.toneProfile,
    at: account.toneProfileAt,
  });
  const [learning, setLearning] = useState(false);

  async function learnTone() {
    setLearning(true);
    try {
      const res = await fetch(`/api/ig/accounts/${account.id}/learn`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "学習に失敗しました");
      setTone({ profile: json.toneProfile, at: json.toneProfileAt });
      onToast("ok", "過去投稿から文体を学習しました。今後のコピー生成に反映されます");
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "学習に失敗しました");
    } finally {
      setLearning(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ig/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoStoryEnabled: enabled,
          autoStoryTimes: times,
          autoStoryTheme: theme,
          autoStoryStyle: styleValue,
          autoStorySource: sourceValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "保存に失敗しました");
      onToast("ok", "自動運用設定を保存しました");
      onChanged();
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm(`@${account.username} の連携を解除しますか？（ストーリーズ履歴も削除されます）`)) return;
    const res = await fetch("/api/ig/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id }),
    });
    if (res.ok) {
      onToast("ok", "連携を解除しました");
      window.location.reload();
    } else {
      onToast("error", "連携解除に失敗しました");
    }
  }

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center text-white font-bold">
            {account.username.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">@{account.username}</p>
          <p className="text-gray-500 text-xs">
            {account.status === "connected" ? (
              <span className="text-emerald-400">連携中</span>
            ) : (
              <span className="text-red-400">要再連携（トークン失効）</span>
            )}
            {account.autoStoryEnabled && account.autoStoryTimes && (
              <span className="ml-2 text-pink-400">自動運用 {account.autoStoryTimes}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Settings2 size={13} /> 自動運用
        </button>
        <button onClick={disconnect} className="text-gray-600 hover:text-red-400 text-xs px-2 py-1.5">
          解除
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-pink-500"
            />
            <span className="text-sm text-white">ストーリーズを毎日自動作成して投稿する</span>
          </label>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">投稿時刻（日本時間・カンマ区切り）</label>
              <input
                type="text"
                value={times}
                onChange={(e) => setTimes(e.target.value)}
                placeholder="08:00, 20:00"
                className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">素材ソース</label>
              <select
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              >
                {AUTO_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {sourceValue !== "ai" && !driveConnected && (
                <p className="text-amber-400 text-[11px] mt-1">
                  ドライブ未設定です（素材がない場合はAI生成にフォールバックします）
                </p>
              )}
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">AI生成時の背景スタイル</label>
              <select
                value={styleValue}
                onChange={(e) => setStyleValue(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              >
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">
              アカウントのテーマ・方向性（コピー・生成の軸になります）
            </label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={2}
              placeholder="例: 渋谷のカフェ。手作りスイーツと季節限定メニューが売り。20〜30代女性向けに親しみやすいトーンで発信"
              className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
            />
          </div>
          {/* 文体プロファイル */}
          <div className="pt-3 border-t border-neutral-800">
            <p className="text-gray-400 text-xs mb-2 flex items-center gap-1.5">
              <BookOpen size={12} className="text-pink-400" />
              文体プロファイル — 過去投稿のキャプションからトーンを学習し、すべてのコピー生成に反映します
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-xs ${tone.profile ? "text-emerald-400" : "text-gray-500"}`}>
                {tone.profile
                  ? `学習済み（${tone.at ? new Date(tone.at).toLocaleDateString("ja-JP") : ""}・週1回自動更新）`
                  : "未学習（週1回の自動学習を待つか、今すぐ学習できます）"}
              </span>
              <button
                onClick={learnTone}
                disabled={learning}
                className="flex items-center gap-1.5 text-xs border border-neutral-700 hover:border-pink-500 text-gray-300 hover:text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {learning ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
                {learning ? "学習中…" : tone.profile ? "再学習" : "今すぐ学習"}
              </button>
            </div>
            {tone.profile && (
              <details className="mt-2">
                <summary className="text-gray-600 text-xs cursor-pointer hover:text-gray-400">学習した文体を見る</summary>
                <pre className="mt-1.5 text-gray-400 text-xs whitespace-pre-wrap bg-black/40 border border-neutral-800 rounded-lg p-3">{tone.profile}</pre>
              </details>
            )}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            設定を保存
          </button>
        </div>
      )}
    </div>
  );
}
