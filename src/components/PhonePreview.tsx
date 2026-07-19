"use client";

import { Film } from "lucide-react";

// ストーリーズのインスタ風プレビュー枠（9:16）。
// imageSrc があれば実画像、なければプレースホルダー文言を表示する。
export function PhonePreview({
  imageSrc,
  username,
  videoBadge = false,
  placeholderTitle,
  placeholderText,
}: {
  imageSrc?: string | null;
  username?: string | null;
  videoBadge?: boolean;
  placeholderTitle?: string;
  placeholderText?: string;
}) {
  return (
    <div className="w-full max-w-[300px] mx-auto">
      <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-[0_0_40px_rgba(236,72,153,0.06)]">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black grid place-items-center p-6 text-center">
            <div>
              <p className="text-gray-400 text-sm font-semibold mb-2">{placeholderTitle ?? "プレビュー"}</p>
              {placeholderText && (
                <p className="text-gray-600 text-xs leading-relaxed whitespace-pre-line">{placeholderText}</p>
              )}
            </div>
          </div>
        )}

        {/* IG風オーバーレイ（プログレスバー＋アカウント行） */}
        <div className="absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-black/50 to-transparent">
          <div className="h-0.5 bg-white/30 rounded-full mb-2.5 overflow-hidden">
            <div className="h-full w-1/3 bg-white rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 border border-white/40 flex-none" />
            <span className="text-white text-[11px] font-semibold drop-shadow">
              {username || "your_account"}
            </span>
            <span className="text-white/60 text-[10px]">たった今</span>
          </div>
        </div>

        {videoBadge && (
          <span className="absolute bottom-2.5 right-2.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
            <Film size={10} /> 動画
          </span>
        )}
      </div>
      <p className="text-center text-gray-600 text-[10px] mt-2">プレビュー（実際の表示イメージ）</p>
    </div>
  );
}
