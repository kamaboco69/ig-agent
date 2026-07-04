// ローカル検証: 1) 合成のみ（グラデーション背景） 2) フルパイプライン（Claude+gpt-image-1）
// 実行: npx tsx --env-file=.env scripts/test-story.ts [full]
import fs from "fs";
import { renderStoryCard } from "../src/lib/story-image";
import { generateStory } from "../src/lib/story-generator";
import sharp from "sharp";

async function main() {
  // 1) 合成のみ
  const jpeg = await renderStoryCard({
    title: "本日17時から新メニュー",
    sub: "抹茶テリーヌ、数量限定で登場します",
    handle: "test_cafe_tokyo",
    bgImageDataUrl: null,
  });
  fs.writeFileSync("scripts/out-gradient.jpg", jpeg);
  const meta = await sharp(jpeg).metadata();
  console.log("gradient card:", meta.width, "x", meta.height, meta.format, `${Math.round(jpeg.length / 1024)}KB`);

  if (process.argv[2] === "full") {
    // 2) フルパイプライン
    const story = await generateStory({
      username: "test_cafe_tokyo",
      theme: "渋谷の小さなカフェ。手作りスイーツと季節限定メニューが売り。20〜30代女性向け",
      instruction: "雨の日限定の割引を告知したい",
      style: "photo",
    });
    console.log("plan:", JSON.stringify({ title: story.overlayTitle, sub: story.overlaySub, concept: story.concept, aiBg: story.usedAiBackground }, null, 2));
    const buf = Buffer.from(story.imageData.split(",")[1], "base64");
    fs.writeFileSync("scripts/out-full.jpg", buf);
    const m2 = await sharp(buf).metadata();
    console.log("full card:", m2.width, "x", m2.height, m2.format, `${Math.round(buf.length / 1024)}KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
