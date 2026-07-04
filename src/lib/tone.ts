// 過去投稿のキャプションからアカウントの「文体プロファイル」を学習する。
// 学習結果は IgAccount.toneProfile に保存し、すべてのコピー生成プロンプトに注入する。

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getIgToken } from "@/lib/ig-token";
import { getUserMedia } from "@/lib/ig-api";
import type { IgAccount } from "@/generated/prisma/client";

const TONE_MODEL = "claude-sonnet-4-6";

// 7日より古いプロファイルは cron(maintain) が再学習する
export const TONE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export class NoCaptionsError extends Error {
  constructor() {
    super("学習に使えるキャプション付きの過去投稿が見つかりませんでした");
    this.name = "NoCaptionsError";
  }
}

// 過去投稿から文体を学習して保存し、プロファイル文字列を返す。
export async function learnToneProfile(account: IgAccount): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が未設定です");

  const token = await getIgToken(account);
  if (!token) throw new Error("Instagramの再連携が必要です");

  const media = await getUserMedia(token, account.igUserId, 50);
  const captions = media
    .map((m) => m.caption?.trim())
    .filter((c): c is string => !!c && c.length >= 5)
    .slice(0, 30);
  if (captions.length === 0) throw new NoCaptionsError();

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: TONE_MODEL,
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content:
          `以下は Instagram アカウント @${account.username} の過去投稿のキャプションです。` +
          `このアカウントの文体・トーンの特徴を分析し、別のAIがコピーを書くときに同じ文体を再現できる` +
          `「文体プロファイル」を日本語の箇条書き（4〜7行、各行は簡潔に）で出力してください。\n` +
          `観点: 口調（です・ます/カジュアル/方言など）、一人称と読者への呼びかけ方、絵文字の使い方（種類・頻度・位置）、` +
          `文の長さとリズム、よく使う言い回し・定型句、記号（！？…など）の癖、全体の温度感。\n` +
          `出力は箇条書きのみ（前置き・後書きなし）。\n\n` +
          captions.map((c, i) => `--- 投稿${i + 1} ---\n${c.slice(0, 400)}`).join("\n"),
      },
    ],
  });

  const profile = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .slice(0, 2000);
  if (!profile) throw new Error("文体の分析に失敗しました");

  await prisma.igAccount.update({
    where: { id: account.id },
    data: { toneProfile: profile, toneProfileAt: new Date() },
  });
  return profile;
}
