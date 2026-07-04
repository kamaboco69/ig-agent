"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarClock,
  Camera,
  Check,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
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
  scheduledAt: string | null;
  postedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  imageUrl: string;
}

const STYLE_OPTIONS = [
  { value: "auto", label: "おまかせ" },
  { value: "photo", label: "写真風" },
  { value: "illustration", label: "イラスト" },
  { value: "minimal", label: "ミニマル" },
  { value: "pop", label: "ポップ" },
];

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
};

export function DashboardClient({
  configured,
  initialAccounts,
  initialStories,
}: {
  configured: boolean;
  initialAccounts: AccountView[];
  initialStories: StoryView[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [accounts] = useState(initialAccounts);
  const [stories, setStories] = useState(initialStories);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // 生成フォーム
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [instruction, setInstruction] = useState("");
  const [style, setStyle] = useState(initialAccounts[0]?.autoStoryStyle ?? "auto");
  const [generating, setGenerating] = useState(false);

  // 選択中ストーリーズ（詳細パネル）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => stories.find((s) => s.id === selectedId) ?? null,
    [stories, selectedId]
  );

  // 連携コールバックのフィードバック
  useEffect(() => {
    const err = params?.get("error");
    const connected = params?.get("connected");
    if (err) {
      const detail = params?.get("detail");
      showToast("error", `${ERROR_MESSAGES[err] ?? err}${detail ? `: ${detail}` : ""}`);
    } else if (connected === "ig") {
      showToast("ok", "Instagramアカウントを連携しました");
    }
    if (err || connected) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 6000);
  }

  async function refreshStories() {
    const res = await fetch("/api/stories");
    if (res.ok) {
      const json = (await res.json()) as { stories: (Omit<StoryView, "username" | "imageUrl"> & { igAccount: { username: string }; imageUrl: string })[] };
      setStories(
        json.stories.map((s) => ({ ...s, username: s.igAccount.username }))
      );
    }
  }

  async function generate() {
    if (!accountId) {
      showToast("error", "Instagramアカウントを先に連携してください");
      return;
    }
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

  async function publishNow(id: string) {
    setBusy(true);
    // 楽観的に「投稿中」表示
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
    if (!scheduleAt) {
      showToast("error", "予約日時を選択してください");
      return;
    }
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

      {/* トースト */}
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
              <AccountCard key={a.id} account={a} onChanged={() => router.refresh()} onToast={showToast} />
            ))}
            {configured && (
              <a
                href="/api/ig/connect"
                className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300 text-sm"
              >
                <Plus size={14} /> 別のアカウントを連携
              </a>
            )}
          </div>
        )}
      </section>

      {/* ストーリーズ作成 */}
      <section className="mb-8">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-pink-400" /> ストーリーズを自動作成
        </h2>
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {accounts.length > 1 && (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>@{a.username}</option>
                ))}
              </select>
            )}
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
            onClick={generate}
            disabled={generating || accounts.length === 0}
            className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? "作成中…（30秒ほどかかります）" : "AIでストーリーズを作成"}
          </button>
          {accounts.length === 0 && (
            <p className="text-gray-500 text-xs">アカウント連携後に利用できます</p>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.imageUrl}
                alt={selected.overlayTitle ?? "story"}
                className="w-full max-w-[240px] aspect-[9/16] object-cover rounded-xl border border-neutral-800 mx-auto md:mx-0"
              />
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[selected.status]?.cls ?? ""}`}>
                    {STATUS_BADGE[selected.status]?.label ?? selected.status}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">@{selected.username}</span>
                  {selected.source === "auto" && (
                    <span className="text-gray-500 text-xs ml-2">（自動運用で生成）</span>
                  )}
                </div>
                {selected.overlayTitle && (
                  <p className="text-white font-bold">{selected.overlayTitle}</p>
                )}
                {selected.overlaySub && <p className="text-gray-300 text-sm">{selected.overlaySub}</p>}
                {selected.concept && (
                  <p className="text-gray-500 text-xs leading-relaxed">狙い: {selected.concept}</p>
                )}
                {selected.errorMessage && (
                  <p className="text-red-400 text-xs break-all">エラー: {selected.errorMessage}</p>
                )}
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
                        <button
                          onClick={() => unschedule(selected.id)}
                          disabled={busy}
                          className="text-gray-400 hover:text-white text-sm px-3 py-2"
                        >
                          予約を解除
                        </button>
                      )}
                      <button
                        onClick={() => remove(selected.id)}
                        disabled={busy}
                        className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm px-3 py-2"
                      >
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
          <button
            onClick={refreshStories}
            className="flex items-center gap-1 text-gray-500 hover:text-white text-xs"
          >
            <RefreshCw size={12} /> 更新
          </button>
        </div>
        {stories.length === 0 ? (
          <p className="text-gray-600 text-sm">まだストーリーズがありません。上のフォームからAIで作成できます。</p>
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
                <span
                  className={`absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[s.status]?.cls ?? ""}`}
                >
                  {STATUS_BADGE[s.status]?.label ?? s.status}
                </span>
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
  onChanged,
  onToast,
}: {
  account: AccountView;
  onChanged: () => void;
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(account.autoStoryEnabled);
  const [times, setTimes] = useState(account.autoStoryTimes ?? "");
  const [theme, setTheme] = useState(account.autoStoryTheme ?? "");
  const [styleValue, setStyleValue] = useState(account.autoStoryStyle);
  const [saving, setSaving] = useState(false);

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
          <div className="grid md:grid-cols-2 gap-3">
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
              <label className="block text-gray-400 text-xs mb-1.5">背景スタイル</label>
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
              アカウントのテーマ・方向性（自動生成の軸になります）
            </label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={2}
              placeholder="例: 渋谷のカフェ。手作りスイーツと季節限定メニューが売り。20〜30代女性向けに親しみやすいトーンで発信"
              className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
            />
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
