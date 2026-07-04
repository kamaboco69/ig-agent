// 実写真パスの検証: コピー立案(Claude) → 写真にコピー焼き込み → JPEG出力
import fs from "fs";
import sharp from "sharp";
import { planCopyForMedia } from "../src/lib/story-generator";
import { composeWithCopy, resizePlain } from "../src/lib/story-media";

async function main() {
  const photo = fs.readFileSync("scripts/clean-photo.jpg"); // 手持ち写真の代わり

  const plan = await planCopyForMedia({
    username: "test_cafe_tokyo",
    theme: "渋谷の小さなカフェ。手作りスイーツと季節限定メニューが売り",
    instruction: "新作の抹茶スイーツ入荷の告知",
    fileName: "matcha-terrine.jpg",
  });
  console.log("copy plan:", JSON.stringify(plan));

  const composed = await composeWithCopy(photo, plan, "test_cafe_tokyo");
  fs.writeFileSync("scripts/out-media.jpg", composed);
  const m = await sharp(composed).metadata();
  console.log("composed:", m.width, "x", m.height, `${Math.round(composed.length / 1024)}KB`);

  const plain = await resizePlain(photo);
  const p = await sharp(plain).metadata();
  console.log("plain resize:", p.width, "x", p.height, `${Math.round(plain.length / 1024)}KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
