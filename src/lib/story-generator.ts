// ストーリーズの自動作成: Claude が構成（コピー＋画像プロンプト）を立て、
// gpt-image-1 が背景を生成し、story-image が 1080x1920 JPEG に合成する。
// OpenAI 未設定/失敗時はグラデーション背景にフォールバックして必ず1枚返す（自動運用を止めない）。

import Anthropic from "@anthropic-ai/sdk";
import { renderStoryCard } from "@/lib/story-image";

const PLAN_MODEL = "claude-sonnet-4-6";
const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_MODEL = "gpt-image-1";

// UIと共有する背景スタイル定義
export const IMAGE_STYLES: Record<string, { label: string; hint: string }> = {
  auto: { label: "おまかせ", hint: "clean, modern, eye-catching vertical composition for an Instagram story" },
  photo: { label: "写真風", hint: "photorealistic photography, natural lighting, shallow depth of field, high detail" },
  illustration: { label: "イラスト", hint: "clean modern flat illustration, vector style, friendly, soft shapes" },
  minimal: { label: "ミニマル", hint: "minimalist, simple geometric shapes, lots of negative space, muted palette" },
  pop: { label: "ポップ", hint: "vibrant pop-art style, bold saturated colors, energetic, high contrast" },
};

export interface StoryPlan {
  concept: string; // 構成メモ（テーマ・狙い）
  overlayTitle: string; // メインコピー（〜16文字目安）
  overlaySub: string | null; // サブコピー（〜28文字目安）
  imagePrompt: string; // 背景画像の英語プロンプト（文字なし）
}

export interface PlanInput {
  username: string; // 投稿先IGアカウントのハンドル
  theme?: string | null; // アカウントのテーマ・方向性（自動運用設定 or 入力フォーム）
  instruction?: string | null; // 今回の指示（任意の自由入力）
  recentTitles?: string[]; // 直近のコピー（マンネリ回避）
}

// Claude でストーリーズの構成を立てる
export async function planStory(input: PlanInput): Promise<StoryPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が未設定です");

  const parts: string[] = [];
  parts.push(`Instagramアカウント: @${input.username}`);
  if (input.theme?.trim()) parts.push(`アカウントのテーマ・方向性: ${input.theme.trim()}`);
  if (input.instruction?.trim()) parts.push(`今回の指示: ${input.instruction.trim()}`);
  if (input.recentTitles?.length) {
    parts.push(`直近のストーリーズのコピー（重複・マンネリを避ける）:\n- ${input.recentTitles.join("\n- ")}`);
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content:
          `あなたはInstagramストーリーズの運用プランナーです。以下の情報から、今日投稿するストーリーズを1枚企画してください。\n\n` +
          parts.join("\n") +
          `\n\n以下のJSONだけを出力してください（前置き・コードブロック不要）:\n` +
          `{\n` +
          `  "concept": "このストーリーズの狙い・構成メモ（日本語1〜2文）",\n` +
          `  "title": "画像に大きく載せるメインコピー（日本語、8〜16文字、体言止めや問いかけで目を引く）",\n` +
          `  "sub": "サブコピー（日本語、15〜28文字。不要なら null）",\n` +
          `  "image_prompt": "背景画像の生成プロンプト（英語。被写体・構図・色調を具体的に。縦長構図。文字・単語・ロゴは絶対に含めない）"\n` +
          `}`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJson(text);
  const title = String(parsed.title ?? "").trim();
  if (!title) throw new Error("ストーリーズ構成の生成に失敗しました（コピーが空）");

  return {
    concept: String(parsed.concept ?? "").trim(),
    overlayTitle: title.slice(0, 30),
    overlaySub: parsed.sub ? String(parsed.sub).trim().slice(0, 50) : null,
    imagePrompt: String(parsed.image_prompt ?? "").trim(),
  };
}

export interface MediaCopyPlan {
  concept: string;
  overlayTitle: string;
  overlaySub: string | null;
}

// 手持ち素材（写真）に載せるコピーを立案する（画像プロンプトは作らない）。
// caption: 素材の元キャプション（過去IG投稿の再利用時）/ fileName: ドライブのファイル名。
export async function planCopyForMedia(input: {
  username: string;
  theme?: string | null;
  instruction?: string | null;
  caption?: string | null;
  fileName?: string | null;
  recentTitles?: string[];
}): Promise<MediaCopyPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が未設定です");

  const parts: string[] = [];
  parts.push(`Instagramアカウント: @${input.username}`);
  if (input.theme?.trim()) parts.push(`アカウントのテーマ・方向性: ${input.theme.trim()}`);
  if (input.instruction?.trim()) parts.push(`今回の指示: ${input.instruction.trim()}`);
  if (input.caption?.trim()) parts.push(`素材写真の元キャプション: ${input.caption.trim().slice(0, 500)}`);
  if (input.fileName?.trim()) parts.push(`素材写真のファイル名: ${input.fileName.trim()}`);
  if (input.recentTitles?.length) {
    parts.push(`直近のストーリーズのコピー（重複・マンネリを避ける）:\n- ${input.recentTitles.join("\n- ")}`);
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content:
          `あなたはInstagramストーリーズの運用プランナーです。手持ちの写真素材の上に載せるコピーを考えてください。` +
          `写真が主役なので、コピーは短く・写真の邪魔をしないこと。\n\n` +
          parts.join("\n") +
          `\n\n以下のJSONだけを出力してください（前置き・コードブロック不要）:\n` +
          `{\n` +
          `  "concept": "このストーリーズの狙い（日本語1文）",\n` +
          `  "title": "メインコピー（日本語、6〜14文字）",\n` +
          `  "sub": "サブコピー（日本語、12〜24文字。不要なら null）"\n` +
          `}`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const parsed = extractJson(text);
  const title = String(parsed.title ?? "").trim();
  if (!title) throw new Error("コピーの生成に失敗しました");

  return {
    concept: String(parsed.concept ?? "").trim(),
    overlayTitle: title.slice(0, 30),
    overlaySub: parsed.sub ? String(parsed.sub).trim().slice(0, 50) : null,
  };
}

function extractJson(text: string): Record<string, unknown> {
  // コードブロックや前置きが混ざっても最初の { ... } を拾う
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("ストーリーズ構成の生成に失敗しました（JSONが見つからない）");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

// 背景画像を gpt-image-1 で生成（縦長 1024x1536・文字なし）。失敗時は null。
async function generateBackground(imagePrompt: string, style: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !imagePrompt) return null;

  const styleHint = (IMAGE_STYLES[style] ?? IMAGE_STYLES.auto).hint;
  const prompt =
    `${imagePrompt}\n\nStyle: ${styleHint}.\n` +
    `Vertical 9:16 composition for an Instagram story background. ` +
    `Keep the lower third relatively simple (text will be overlaid there). ` +
    `Important: do not render any text, words, letters, numbers, or logos in the image.`;

  try {
    const res = await fetch(OPENAI_IMAGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1024x1536", // gpt-image-1 の縦長サイズ（合成時に 1080x1920 へカバー拡大）
        quality: "medium",
      }),
    });
    if (!res.ok) {
      console.error(`gpt-image-1 failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch (e) {
    console.error("gpt-image-1 request error:", e);
    return null;
  }
}

export interface GeneratedStory extends StoryPlan {
  imageData: string; // data:image/jpeg;base64,...（1080x1920）
  usedAiBackground: boolean;
}

// 構成 → 背景生成 → 合成 まで一気に行う。
export async function generateStory(
  input: PlanInput & { style?: string }
): Promise<GeneratedStory> {
  const plan = await planStory(input);
  const bg = await generateBackground(plan.imagePrompt, input.style ?? "auto");

  const jpeg = await renderStoryCard({
    title: plan.overlayTitle,
    sub: plan.overlaySub,
    handle: input.username,
    bgImageDataUrl: bg,
  });

  return {
    ...plan,
    imageData: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    usedAiBackground: !!bg,
  };
}
