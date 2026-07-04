// ストーリーズ画像（1080x1920 JPEG）の合成。
// 背景（AI生成PNG または グラデーション）に日本語コピーを焼き込む。
// 文字描画は next/og(satori) + 同梱の Noto Sans JP を使い、実行環境のフォント有無に依存しない。

import fs from "fs";
import path from "path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

let fontCache: Buffer | null = null;

function loadFont(): Buffer {
  if (!fontCache) {
    fontCache = fs.readFileSync(
      path.join(process.cwd(), "src/assets/fonts/NotoSansJP-Bold.otf")
    );
  }
  return fontCache;
}

export interface StoryCardInput {
  title: string; // メインコピー（画像に大きく表示）
  sub?: string | null; // サブコピー
  handle?: string | null; // @ハンドル（下部に小さく表示）
  bgImageDataUrl?: string | null; // 背景PNG/JPEGのdata URL。null ならグラデーション背景
}

// グラデーションはタイトル文字列から決定的に選ぶ（同じ内容なら同じ見た目）
const GRADIENTS = [
  "linear-gradient(135deg, #4f46e5 0%, #9333ea 55%, #ec4899 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, #6366f1 60%, #a21caf 100%)",
  "linear-gradient(135deg, #059669 0%, #0d9488 55%, #0369a1 100%)",
  "linear-gradient(135deg, #ea580c 0%, #db2777 60%, #7c3aed 100%)",
  "linear-gradient(135deg, #111827 0%, #374151 60%, #6b7280 100%)",
];

function pickGradient(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

// 1080x1920 のストーリーズカードを合成して JPEG Buffer を返す。
export async function renderStoryCard(input: StoryCardInput): Promise<Buffer> {
  const font = loadFont();
  const { title, sub, handle, bgImageDataUrl } = input;

  // タイトルは可能な限り1行に収める（描画幅 936px ÷ 文字数）。長文は 60px で2行に折り返す
  const titleSize = Math.max(60, Math.min(104, Math.floor(920 / Math.max(title.length, 1))));

  const element = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: bgImageDataUrl ? "#000" : pickGradient(title),
        fontFamily: "NotoSansJP",
      }}
    >
      {bgImageDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgImageDataUrl}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

      {/* 下部スクリム（文字の可読性確保） */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "62%",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* コピー（IGのUIと被らないよう上250px/下340pxのセーフゾーンを避けて下1/3に配置） */}
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.28,
            letterSpacing: "0.01em",
            textShadow: "0 4px 24px rgba(0,0,0,0.45)",
            wordBreak: "break-all",
          }}
        >
          {title}
        </div>
        {sub ? (
          <div
            style={{
              display: "flex",
              marginTop: 36,
              fontSize: 42,
              fontWeight: 700,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.5,
              textShadow: "0 2px 16px rgba(0,0,0,0.45)",
              wordBreak: "break-all",
            }}
          >
            {sub}
          </div>
        ) : null}
        {handle ? (
          <div
            style={{
              display: "flex",
              marginTop: 44,
              fontSize: 32,
              fontWeight: 700,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            @{handle}
          </div>
        ) : null}
      </div>
    </div>
  );

  const res = new ImageResponse(element, {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    fonts: [{ name: "NotoSansJP", data: font, weight: 700, style: "normal" }],
  });

  const png = Buffer.from(await res.arrayBuffer());
  // IG のストーリーズ取り込みは JPEG が必須のため変換する
  return sharp(png).jpeg({ quality: 88 }).toBuffer();
}
