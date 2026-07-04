// gpt-image-1 背景生成 + 背景あり合成の検証（Claude を使わない）
// 実行: npx tsx --env-file=.env scripts/test-bg.ts
import fs from "fs";
import sharp from "sharp";
import { renderStoryCard } from "../src/lib/story-image";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 未設定");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt:
        "A cozy Japanese cafe interior on a rainy day, warm lighting, matcha dessert on a wooden table, rain drops on the window, soft bokeh. " +
        "Vertical 9:16 composition for an Instagram story background. Keep the lower third relatively simple. " +
        "Important: do not render any text, words, letters, numbers, or logos in the image.",
      n: 1,
      size: "1024x1536",
      quality: "medium",
    }),
  });
  if (!res.ok) throw new Error(`gpt-image-1: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data");
  console.log("bg generated:", Math.round((b64.length * 3) / 4 / 1024), "KB");

  const jpeg = await renderStoryCard({
    title: "雨の日は10%OFF",
    sub: "本日、雨の日割引やってます ☕",
    handle: "test_cafe_tokyo",
    bgImageDataUrl: `data:image/png;base64,${b64}`,
  });
  fs.writeFileSync("scripts/out-bg.jpg", jpeg);
  const meta = await sharp(jpeg).metadata();
  console.log("composited:", meta.width, "x", meta.height, meta.format, `${Math.round(jpeg.length / 1024)}KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
