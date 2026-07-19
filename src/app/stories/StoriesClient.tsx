"use client";

import { useMemo, useState } from "react";
import { Film, RefreshCw } from "lucide-react";
import { useToast } from "@/components/useToast";
import { StoryPanel } from "@/components/StoryPanel";
import { STATUS_BADGE, type StoryView } from "../view-types";

export function StoriesClient({ initialStories }: { initialStories: StoryView[] }) {
  const { showToast, toastEl } = useToast();
  const [stories, setStories] = useState(initialStories);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => stories.find((s) => s.id === selectedId) ?? null, [stories, selectedId]);

  async function refresh() {
    const res = await fetch("/api/stories");
    if (res.ok) {
      const json = (await res.json()) as {
        stories: (Omit<StoryView, "username"> & { igAccount: { username: string } })[];
      };
      setStories(json.stories.map((s) => ({ ...s, username: s.igAccount.username })));
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {toastEl}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white font-bold text-lg">ストーリーズ</h1>
        <button onClick={refresh} className="flex items-center gap-1 text-gray-500 hover:text-white text-xs">
          <RefreshCw size={12} /> 更新
        </button>
      </div>

      {selected && (
        <div className="mb-6">
          <StoryPanel
            key={selected.id}
            story={selected}
            onClose={() => setSelectedId(null)}
            onMutated={(next) => {
              if (next === null) {
                setStories((prev) => prev.filter((s) => s.id !== selected.id));
                setSelectedId(null);
              } else {
                setStories((prev) => prev.map((s) => (s.id === next.id ? next : s)));
              }
            }}
            onToast={showToast}
          />
        </div>
      )}

      {stories.length === 0 ? (
        <p className="text-gray-600 text-sm">まだストーリーズがありません。「作成」ページから作れます。</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {stories.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedId(s.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
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
              {s.mediaType === "video" && (
                <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Film size={9} /> 動画
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
