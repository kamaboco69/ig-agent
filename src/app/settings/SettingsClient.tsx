"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Camera, Check, FolderOpen, Loader2, Plus, Settings2 } from "lucide-react";
import { useToast } from "@/components/useToast";
import {
  AUTO_SOURCE_OPTIONS,
  STYLE_OPTIONS,
  type AccountView,
  type DriveView,
} from "../view-types";

export function SettingsClient({
  configured,
  accounts,
  drive,
}: {
  configured: boolean;
  accounts: AccountView[];
  drive: DriveView;
}) {
  const router = useRouter();
  const { showToast, toastEl } = useToast();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {toastEl}
      <h1 className="text-white font-bold text-lg mb-6">設定</h1>

      {/* Instagramアカウント */}
      <section className="mb-8">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <Camera size={16} className="text-pink-400" /> Instagramアカウント
        </h2>
        {accounts.length === 0 ? (
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center">
            <p className="text-gray-300 font-medium">Instagramプロアカウントを連携しましょう</p>
            {configured ? (
              <a
                href="/api/ig/connect"
                className="inline-flex items-center gap-2 mt-4 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 hover:opacity-90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-opacity"
              >
                <Plus size={16} /> Instagramを連携する
              </a>
            ) : (
              <p className="text-amber-400 text-sm mt-4">IG_APP_ID / IG_APP_SECRET が未設定です</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                driveConnected={drive.connected && !!drive.folderId}
                onChanged={() => router.refresh()}
                onToast={showToast}
              />
            ))}
            {configured && (
              <a href="/api/ig/connect" className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300 text-sm">
                <Plus size={14} /> 別のアカウントを連携
              </a>
            )}
          </div>
        )}
      </section>

      {/* Googleドライブ */}
      <section>
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <FolderOpen size={16} className="text-pink-400" /> Googleドライブ（メディアライブラリ）
        </h2>
        <DriveCard drive={drive} onToast={showToast} onChanged={() => router.refresh()} />
      </section>
    </div>
  );
}

// ドライブ連携状態・フォルダ設定・解除
function DriveCard({
  drive,
  onToast,
  onChanged,
}: {
  drive: DriveView;
  onToast: (kind: "ok" | "error", text: string) => void;
  onChanged: () => void;
}) {
  const [folderUrl, setFolderUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveFolder() {
    if (!folderUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gdrive/folder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "フォルダの設定に失敗しました");
      onToast("ok", `素材フォルダを「${json.folder.name}」に設定しました`);
      setEditing(false);
      setFolderUrl("");
      onChanged();
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "フォルダの設定に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Googleドライブの連携を解除しますか？（定期配信のライブラリモードも使えなくなります）")) return;
    const res = await fetch("/api/gdrive/disconnect", { method: "POST" });
    if (res.ok) {
      onToast("ok", "Googleドライブの連携を解除しました");
      onChanged();
    } else {
      onToast("error", "解除に失敗しました");
    }
  }

  if (!drive.connected) {
    return (
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 text-center">
        <p className="text-gray-400 text-sm mb-3">
          連携すると、指定フォルダの写真・動画をストーリーズ素材として使えます
        </p>
        <a
          href="/api/gdrive/connect"
          className="inline-flex items-center gap-2 bg-white text-gray-800 hover:bg-gray-100 text-sm font-semibold px-4 py-2 rounded-lg"
        >
          <FolderOpen size={15} /> Googleドライブを連携
        </a>
      </div>
    );
  }

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-emerald-400 text-xs font-semibold">連携中</span>
        {drive.googleEmail && <span className="text-gray-500 text-xs">{drive.googleEmail}</span>}
        <span className="text-gray-300 text-xs flex items-center gap-1.5">
          <FolderOpen size={13} className="text-pink-400" />
          {drive.folderName ? `デフォルト素材フォルダ: ${drive.folderName}` : "素材フォルダ未設定"}
        </span>
        <button onClick={() => setEditing(!editing)} className="text-gray-500 hover:text-white text-xs">
          {drive.folderName ? "フォルダ変更" : "フォルダ設定"}
        </button>
        <button onClick={disconnect} className="text-gray-600 hover:text-red-400 text-xs ml-auto">
          連携解除
        </button>
      </div>
      {editing && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          />
          <button
            onClick={saveFolder}
            disabled={busy || !folderUrl.trim()}
            className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : "設定"}
          </button>
        </div>
      )}
    </div>
  );
}

// アカウントカード＋オートパイロット設定＋文体プロファイル
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
