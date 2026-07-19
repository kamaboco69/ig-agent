"use client";

import { useState } from "react";
import { CalendarClock, Film, Loader2, Send, Trash2, X } from "lucide-react";
import { STATUS_BADGE, type StoryView } from "@/app/view-types";

// ストーリーズ1件のプレビュー＋操作（今すぐ投稿/予約/予約解除/削除）。
// 作成ページとストーリーズ一覧ページで共用。操作結果は onMutated で親に通知（null=削除）。
export function StoryPanel({
  story,
  onClose,
  onMutated,
  onToast,
}: {
  story: StoryView;
  onClose: () => void;
  onMutated: (next: StoryView | null) => void;
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  async function publishNow() {
    setBusy(true);
    onMutated({ ...story, status: "posting" });
    try {
      const res = await fetch(`/api/stories/${story.id}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "投稿に失敗しました");
      onMutated({ ...story, status: "posted", postedAt: new Date().toISOString(), errorMessage: null });
      onToast("ok", "ストーリーズを投稿しました 🎉");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "投稿に失敗しました";
      onMutated({ ...story, status: "failed", errorMessage: msg });
      onToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!scheduleAt) return onToast("error", "予約日時を選択してください");
    setBusy(true);
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(scheduleAt).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "予約に失敗しました");
      onMutated({ ...story, status: "scheduled", scheduledAt: new Date(scheduleAt).toISOString(), errorMessage: null });
      onToast("ok", "予約しました。時刻になると自動投稿されます");
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "予約に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function unschedule() {
    setBusy(true);
    try {
      await fetch(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: null }),
      });
      onMutated({ ...story, status: "draft", scheduledAt: null });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("このストーリーズを削除しますか？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stories/${story.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "削除に失敗しました");
      }
      onMutated(null);
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const actionable = story.status === "draft" || story.status === "failed" || story.status === "scheduled";

  return (
    <div className="bg-neutral-950 border border-pink-500/40 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">プレビュー</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X size={18} />
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-5">
        <div className="relative w-full max-w-[240px] mx-auto md:mx-0 flex-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.imageUrl}
            alt={story.overlayTitle ?? "story"}
            className="w-full aspect-[9/16] object-cover rounded-xl border border-neutral-800"
          />
          {story.mediaType === "video" && (
            <span className="absolute top-2 right-2 bg-black/70 text-white text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1">
              <Film size={11} /> 動画
            </span>
          )}
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[story.status]?.cls ?? ""}`}>
              {STATUS_BADGE[story.status]?.label ?? story.status}
            </span>
            <span className="text-gray-500 text-xs ml-2">@{story.username}</span>
            {story.source === "auto" && <span className="text-gray-500 text-xs ml-2">（自動運用で生成）</span>}
            {story.mediaType === "video" && (
              <span className="text-gray-500 text-xs ml-2">動画（プレビューはサムネイル）</span>
            )}
          </div>
          {story.overlayTitle && <p className="text-white font-bold">{story.overlayTitle}</p>}
          {story.overlaySub && <p className="text-gray-300 text-sm">{story.overlaySub}</p>}
          {story.concept && <p className="text-gray-500 text-xs leading-relaxed">狙い: {story.concept}</p>}
          {story.errorMessage && <p className="text-red-400 text-xs break-all">エラー: {story.errorMessage}</p>}
          {story.scheduledAt && story.status === "scheduled" && (
            <p className="text-sky-400 text-sm flex items-center gap-1.5">
              <CalendarClock size={14} />
              {new Date(story.scheduledAt).toLocaleString("ja-JP")} に投稿予定
            </p>
          )}

          {actionable && (
            <div className="pt-2 space-y-3 border-t border-neutral-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={publishNow}
                  disabled={busy}
                  className="flex items-center gap-1.5 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  今すぐ投稿
                </button>
                {story.status === "scheduled" && (
                  <button onClick={unschedule} disabled={busy} className="text-gray-400 hover:text-white text-sm px-3 py-2">
                    予約を解除
                  </button>
                )}
                <button onClick={remove} disabled={busy} className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm px-3 py-2">
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
                  onClick={schedule}
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
  );
}
