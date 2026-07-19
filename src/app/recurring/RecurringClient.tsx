"use client";

import { useState } from "react";
import { Check, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/useToast";
import { INTERVAL_OPTIONS, intervalLabel, type RecurringView } from "../view-types";

const MODE_OPTIONS = [
  { value: "ai", label: "AIで毎回生成", hint: "コピーも背景も毎回変わる" },
  { value: "library", label: "ドライブフォルダの素材から", hint: "写真をローテーション＋AIコピー" },
  { value: "fixed", label: "登録画像をそのまま投稿", hint: "毎回同じ画像" },
] as const;

export function RecurringClient({
  initialItems,
  accounts,
  driveReady,
}: {
  initialItems: RecurringView[];
  accounts: { id: string; username: string }[];
  driveReady: boolean;
}) {
  const { showToast, toastEl } = useToast();
  const [items, setItems] = useState(initialItems);
  const [showForm, setShowForm] = useState(initialItems.length === 0);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"ai" | "library" | "fixed">("ai");
  const [instruction, setInstruction] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [interval, setIntervalDays] = useState(1);
  const [time, setTime] = useState("18:00");
  const [saving, setSaving] = useState(false);

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("error", "画像ファイルを選択してください");
    if (file.size > 15 * 1024 * 1024) return showToast("error", "画像は15MB以下にしてください");
    const reader = new FileReader();
    reader.onload = () => setImage({ dataUrl: String(reader.result), fileName: file.name });
    reader.readAsDataURL(file);
  }

  async function add() {
    if (!accountId) return showToast("error", "Instagramアカウントを先に連携してください");
    setSaving(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          igAccountId: accountId,
          name,
          mode,
          instruction,
          dataUrl: image?.dataUrl,
          folderUrl,
          intervalDays: interval,
          timeJst: time,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "登録に失敗しました");
      const username = accounts.find((a) => a.id === accountId)?.username ?? "";
      setItems((prev) => [...prev, { ...json.item, username }]);
      setName("");
      setInstruction("");
      setImage(null);
      setFolderUrl("");
      setShowForm(false);
      showToast("ok", "定期配信を登録しました");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    const res = await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
      showToast("error", "更新に失敗しました");
    }
  }

  async function remove(id: string) {
    if (!confirm("この定期配信を削除しますか？")) return;
    const res = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setItems((prev) => prev.filter((r) => r.id !== id));
    } else {
      showToast("error", "削除に失敗しました");
    }
  }

  const modeLabel = (r: RecurringView) =>
    r.mode === "fixed" ? "固定画像" : r.mode === "library" ? `素材: ${r.driveFolderName ?? "デフォルトフォルダ"}` : "AI生成";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {toastEl}
      <h1 className="text-white font-bold text-lg mb-2">定期配信</h1>
      <p className="text-gray-500 text-xs mb-6">
        「本日18時オープン」のような繰り返し投稿を登録すると、設定した間隔・時刻で自動投稿します。
      </p>

      <div className="space-y-2 mb-5">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3">
            <button
              onClick={() => toggle(r.id, !r.enabled)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-none ${r.enabled ? "bg-pink-600" : "bg-neutral-700"}`}
              title={r.enabled ? "有効（クリックで停止）" : "停止中（クリックで再開）"}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.enabled ? "left-[18px]" : "left-0.5"}`} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{r.name}</p>
              <p className="text-gray-500 text-xs truncate">
                @{r.username}・{modeLabel(r)}・{intervalLabel(r.intervalDays)} {r.timeJst}
                {r.enabled && (
                  <span className="ml-2 text-sky-400">
                    次回 {new Date(r.nextRunAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </p>
            </div>
            <button onClick={() => remove(r.id)} className="text-gray-600 hover:text-red-400 flex-none">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {items.length === 0 && !showForm && (
          <p className="text-gray-600 text-sm">まだ定期配信がありません。</p>
        )}
      </div>

      {showForm ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名前（例: 開店告知）"
              className="bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            />
            <div className="flex gap-2 items-center">
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
                value={interval}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="flex-1 bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                title={m.hint}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  mode === m.value ? "border-pink-500 bg-pink-500/10 text-white" : "border-neutral-700 text-gray-400 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "library" && (
            <div className="space-y-2">
              {!driveReady && (
                <p className="text-amber-400 text-xs">
                  Googleドライブが未連携です。先に「作成」ページの「写真・動画から作成 → Googleドライブ」で連携してください
                </p>
              )}
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="text-pink-400 flex-none" />
                <input
                  type="text"
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  placeholder="この配信専用のフォルダURL（空欄ならデフォルトの素材フォルダ）"
                  className="flex-1 bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                />
              </div>
              <p className="text-gray-600 text-xs">
                フォルダ内の写真・動画をローテーションで使用（直近に使ったものは避けます）。写真にはAIがコピーを載せ、動画はそのまま投稿します。
              </p>
            </div>
          )}

          {(mode === "ai" || mode === "library") && (
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder={
                mode === "ai"
                  ? "生成指示（例: 本日18時オープンの告知。今日のおすすめを一言添えて来店を促す）"
                  : "コピーの指示（任意。例: 本日9時オープン！を毎回入れる）"
              }
              className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
            />
          )}

          {mode === "fixed" && (
            <label className="block border border-dashed border-neutral-700 hover:border-pink-500 rounded-xl p-4 text-center cursor-pointer transition-colors">
              <input type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.dataUrl} alt={image.fileName} className="max-h-32 mx-auto rounded-lg" />
              ) : (
                <span className="text-gray-500 text-sm">毎回投稿する画像を選択</span>
              )}
            </label>
          )}

          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={saving || accounts.length === 0}
              className="flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              登録
            </button>
            {items.length > 0 && (
              <button onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-2">
                キャンセル
              </button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-pink-400 hover:text-pink-300 text-sm">
          <Plus size={14} /> 定期配信を追加
        </button>
      )}
    </div>
  );
}
