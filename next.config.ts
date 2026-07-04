import type { NextConfig } from "next";
import path from "path";

// ai-company などからの iframe 埋め込みを許可するオリジン（将来のブリッジ用）
const EMBED_PARENT = (process.env.EMBED_PARENT_ORIGIN ?? "").trim();
const FRAME_ANCESTORS = ["'self'", ...(EMBED_PARENT ? [EMBED_PARENT] : [])].join(" ");

const nextConfig: NextConfig = {
  // 親ディレクトリの lockfile を誤検出しないよう、このプロジェクトをルートに固定
  turbopack: {
    root: path.resolve(__dirname),
  },
  // ストーリーズ画像合成（satori）で使う日本語フォントをサーバーバンドルに含める
  outputFileTracingIncludes: {
    "/api/stories/generate": ["./src/assets/fonts/**"],
    "/api/cron": ["./src/assets/fonts/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS};` },
        ],
      },
    ];
  },
};

export default nextConfig;
