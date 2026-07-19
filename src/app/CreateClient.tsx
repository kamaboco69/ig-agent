"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Film,
  FolderOpen,
  HardDriveUpload,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/useToast";
import { StoryPanel } from "@/components/StoryPanel";
import {
  ERROR_MESSAGES,
  STYLE_OPTIONS,
  type AccountView,
  type DriveView,
  type StoryView,
} from "./view-types";

interface DriveFileView {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  durationMillis?: number;
}

interface IgMediaView {
  id: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
}

export function CreateClient({
  configured,
  accounts,
  drive,
}: {
  configured: boolean;
  accounts: AccountView[];
  drive: DriveView;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const paramError = params?.get("error") ?? null;
  const paramConnected = params?.get("connected") ?? null;
  const { showToast, toastEl } = useToast(
    paramError
      ? { kind: "error", text: `${ERROR_MESSAGES[paramError] ?? paramError}${params?.get("detail") ? `: ${params.get("detail")}` : ""}` }
      : paramConnected === "ig"
        ? { kind: "ok", text: "Instagramアカウントを連携しました" }
        : paramConnected === "gdrive"
          ? { kind: "ok", text: "Googleドライブを連携しました。素材フォルダを設定してください" }
          : null
  );

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [createMode, setCreateMode] = useState<"ai" | "media">(paramConnected === "gdrive" ? "media" : "ai");
  const [style, setStyle] = useState(accounts[0]?.autoStoryStyle ?? "auto");

  const [mediaTab, setMediaTab] = useState<"upload" | "drive" | "ig">(paramConnected === "gdrive" ? "drive" : "upload");
  const [overlay, setOverlay] = useState(true);
  const [upload, setUpload] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileView[] | null>(null);
  const [driveFolder, setDriveFolder] = useState<{ id: string; name: string } | null>(
    drive.folderId ? { id: drive.folderId, name: drive.folderName ?? "" } : null
  );
  const [driveLoading, setDriveLoading] = useState(false);
  const [folderUrl, setFolderUrl] = useState("");
  const [editFolder, setEditFolder] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState<DriveFileView | null>(null);
  const [igItems, setIgItems] = useState<IgMediaView[] | null>(null);
  const [igLoading, setIgLoading] = useState(false);
  const [selectedIg, setSelectedIg] = useState<IgMediaView | null>(null);

  // 直近で作成したストーリーズ（プレビュー＋操作）
  const [created, setCreated] = useState<StoryView | null>(null);

  const selectedIsVideo =
    (mediaTab === "drive" && selectedDrive?.mimeType.startsWith("video/")) ||
    (mediaTab === "ig" && selectedIg?.mediaType === "VIDEO");

  useEffect(() => {
    if (paramError || paramConnected) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDriveFiles = useCallback(async () => {
    setDriveLoading(true);
    try {
      const res = await fetch("/api/gdrive/files");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "一覧の取得に失敗しました");
      setDriveFolder(json.folder ?? null);
      setDriveFiles(json.files ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ドライブの読み込みに失敗しました");
      setDriveFiles([]);
    } finally {
      setDriveLoading(false);
    }
  }, [showToast]);

  const loadIgMedia = useCallback(
    async (forAccountId: string) => {
      setIgLoading(true);
      try {
        const res = await fetch(`/api/ig/media?accountId=${encodeURIComponent(forAccountId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "過去投稿の取得に失敗しました");
        setIgItems(json.items ?? []);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "過去投稿の取得に失敗しました");
        setIgItems([]);
      } finally {
        setIgLoading(false);
      }
    },
    [showToast]
  );

  function openMediaTab(tab: "upload" | "drive" | "ig") {
    setMediaTab(tab);
    if (tab === "drive" && drive.connected && driveFolder && driveFiles === null) void loadDriveFiles();
    if (tab === "ig" && igItems === null) void loadIgMedia(accountId);
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("error", "画像ファイルを選択してください（動画はドライブ/過去投稿から使えます）");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast("error", "画像は15MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUpload({ dataUrl: String(reader.result), fileName: file.name });
    reader.readAsDataURL(file);
  }

  async function saveFolder() {
    if (!folderUrl.trim()) return;
    setDriveLoading(true);
    try {
      const res = await fetch("/api/gdrive/folder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "フォルダの設定に失敗しました");
      setDriveFolder(json.folder);
      setEditFolder(false);
      setFolderUrl("");
      setDriveFiles(null);
      await loadDriveFiles();
      showToast("ok", `素材フォルダを「${json.folder.name}」に設定しました`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "フォルダの設定に失敗しました");
      setDriveLoading(false);
    }
  }

  function username() {
    return accounts.find((a) => a.id === accountId)?.username ?? "";
  }

  function toStoryView(s: {
    id: string; overlayTitle: string | null; overlaySub: string | null; concept: string | null;
    status: string; mediaType?: string; imageUrl: string;
  }): StoryView {
    return {
      id: s.id,
      igAccountId: accountId,
      username: username(),
      concept: s.concept,
      overlayTitle: s.overlayTitle,
      overlaySub: s.overlaySub,
      status: s.status,
      source: "manual",
      mediaType: s.mediaType ?? "image",
      sourceKind: "manual",
      scheduledAt: null,
      postedAt: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      imageUrl: s.imageUrl,
    };
  }

  async function generateAi() {
    if (!accountId) return showToast("error", "Instagramアカウントを先に連携してください");
    setGenerating(true);
    try {
      const res = await fetch("/api/stories/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igAccountId: accountId, instruction, style }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "生成に失敗しました");
      setInstruction("");
      setCreated(toStoryView(json.story));
      showToast("ok", "ストーリーズを作成しました。プレビューを確認して投稿してください");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  async function createFromMedia() {
    if (!accountId) return showToast("error", "Instagramアカウントを先に連携してください");

    let body: Record<string, unknown>;
    if (mediaTab === "upload") {
      if (!upload) return showToast("error", "画像を選択してください");
      body = { source: "upload", dataUrl: upload.dataUrl, fileName: upload.fileName };
    } else if (mediaTab === "drive") {
      if (!selectedDrive) return showToast("error", "ファイルを選択してください");
      body = { source: "library", fileId: selectedDrive.id, mimeType: selectedDrive.mimeType, fileName: selectedDrive.name };
    } else {
      if (!selectedIg) return showToast("error", "投稿を選択してください");
      body = {
        source: "ig",
        igMediaId: selectedIg.id,
        mediaUrl: selectedIg.mediaUrl,
        mediaTypeHint: selectedIg.mediaType,
        caption: selectedIg.caption,
      };
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/stories/from-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, igAccountId: accountId, overlay: overlay && !selectedIsVideo, instruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "作成に失敗しました");
      setInstruction("");
      setUpload(null);
      setSelectedDrive(null);
      setSelectedIg(null);
      setCreated(toStoryView(json.story));
      showToast(
        "ok",
        json.story.mediaType === "video"
          ? "動画ストーリーズを準備しました。プレビューはサムネイル表示です"
          : "ストーリーズを作成しました。プレビューを確認して投稿してください"
      );
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  const fmtDuration = (ms?: number) => {
    if (!ms) return "";
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {toastEl}
      <h1 className="text-white font-bold text-lg mb-6">ストーリーズを作成</h1>

      {accounts.length === 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center mb-6">
          <p className="text-gray-300 font-medium">Instagramプロアカウントを連携しましょう</p>
          <p className="text-gray-500 text-sm mt-1">
            ビジネス/クリエイターアカウントでログインすると、ストーリーズの自動作成・自動投稿が使えます
          </p>
          {configured ? (
            <a
              href="/api/ig/connect"
              className="inline-flex items-center gap-2 mt-4 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 hover:opacity-90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-opacity"
            >
              <Plus size={16} /> Instagramを連携する
            </a>
          ) : (
            <p className="text-amber-400 text-sm mt-4">IG_APP_ID / IG_APP_SECRET が未設定です</p>
          )}
        </div>
      )}

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCreateMode("ai")}
            className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
              createMode === "ai" ? "border-pink-500 bg-pink-500/10 text-white" : "border-neutral-700 text-gray-400 hover:text-white"
            }`}
          >
            <Sparkles size={13} className="inline mr-1.5 -mt-0.5" />AIおまかせ
          </button>
          <button
            onClick={() => setCreateMode("media")}
            className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
              createMode === "media" ? "border-pink-500 bg-pink-500/10 text-white" : "border-neutral-700 text-gray-400 hover:text-white"
            }`}
          >
            <Film size={13} className="inline mr-1.5 -mt-0.5" />写真・動画から作成
          </button>
          {accounts.length > 1 && (
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setSelectedIg(null);
                setIgItems(null);
                if (createMode === "media" && mediaTab === "ig") void loadIgMedia(e.target.value);
              }}
              className="ml-auto bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </select>
          )}
        </div>

        {createMode === "ai" ? (
          <>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
            >
              {STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>背景: {o.label}</option>
              ))}
            </select>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder="今回のテーマ・指示（任意）例: 新メニューの告知 / 今日の営業時間 / フォロワーへの質問"
              className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
            />
            <button
              onClick={generateAi}
              disabled={generating || accounts.length === 0}
              className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? "作成中…（30秒ほどかかります）" : "AIでストーリーズを作成"}
            </button>
          </>
        ) : (
          <>
            <div className="flex gap-2 border-b border-neutral-800 pb-3 overflow-x-auto">
              {([
                { key: "upload", label: "アップロード", icon: HardDriveUpload },
                { key: "drive", label: "Googleドライブ", icon: FolderOpen },
                { key: "ig", label: "過去のIG投稿", icon: History },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => openMediaTab(t.key)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors flex-none ${
                    mediaTab === t.key ? "border-pink-500 bg-pink-500/10 text-white" : "border-neutral-700 text-gray-400 hover:text-white"
                  }`}
                >
                  <t.icon size={12} /> {t.label}
                </button>
              ))}
            </div>

            {mediaTab === "upload" && (
              <label className="block border border-dashed border-neutral-700 hover:border-pink-500 rounded-xl p-6 text-center cursor-pointer transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
                {upload ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={upload.dataUrl} alt={upload.fileName} className="max-h-48 mx-auto rounded-lg" />
                ) : (
                  <span className="text-gray-500 text-sm">
                    タップして画像を選択（JPG/PNG・15MBまで）<br />
                    <span className="text-xs">動画はGoogleドライブまたは過去のIG投稿から使えます</span>
                  </span>
                )}
              </label>
            )}

            {mediaTab === "drive" && (
              <div className="space-y-3">
                {!drive.connected ? (
                  <div className="text-center py-4">
                    <p className="text-gray-400 text-sm mb-3">
                      Googleドライブを連携すると、指定フォルダの写真・動画を素材として使えます
                    </p>
                    <a
                      href="/api/gdrive/connect"
                      className="inline-flex items-center gap-2 bg-white text-gray-800 hover:bg-gray-100 text-sm font-semibold px-4 py-2 rounded-lg"
                    >
                      <FolderOpen size={15} /> Googleドライブを連携
                    </a>
                  </div>
                ) : !driveFolder || editFolder ? (
                  <div className="space-y-2">
                    <p className="text-gray-400 text-xs">
                      素材フォルダのURLを貼り付けてください
                      {drive.googleEmail && <span className="ml-2 text-gray-600">連携中: {drive.googleEmail}</span>}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={folderUrl}
                        onChange={(e) => setFolderUrl(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="flex-1 bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveFolder}
                          disabled={driveLoading || !folderUrl.trim()}
                          className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                        >
                          {driveLoading ? <Loader2 size={14} className="animate-spin" /> : "設定"}
                        </button>
                        {editFolder && (
                          <button onClick={() => setEditFolder(false)} className="text-gray-500 text-sm px-2">キャンセル</button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1.5"><FolderOpen size={13} className="text-pink-400" /> {driveFolder.name}</span>
                      <button onClick={() => setEditFolder(true)} className="text-gray-600 hover:text-white">フォルダ変更</button>
                      <button onClick={() => { setDriveFiles(null); void loadDriveFiles(); }} className="flex items-center gap-1 text-gray-600 hover:text-white">
                        <RefreshCw size={11} /> 再読込
                      </button>
                    </div>
                    {driveLoading ? (
                      <p className="text-gray-500 text-sm py-4 text-center"><Loader2 size={16} className="animate-spin inline mr-2" />読み込み中…</p>
                    ) : (driveFiles ?? []).length === 0 ? (
                      <p className="text-gray-600 text-sm py-4 text-center">フォルダに画像・動画がありません</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 max-h-64 overflow-y-auto pr-1">
                        {(driveFiles ?? []).map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedDrive(selectedDrive?.id === f.id ? null : f)}
                            title={f.name}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-neutral-900 ${
                              selectedDrive?.id === f.id ? "border-pink-500" : "border-transparent hover:border-neutral-600"
                            }`}
                          >
                            {f.thumbnailLink ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={f.thumbnailLink} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="absolute inset-0 grid place-items-center text-gray-600 text-[10px] p-1 break-all">{f.name}</span>
                            )}
                            {f.mimeType.startsWith("video/") && (
                              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-semibold px-1 rounded flex items-center gap-0.5">
                                <Film size={9} />{fmtDuration(f.durationMillis)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {mediaTab === "ig" && (
              <div className="space-y-3">
                {igLoading ? (
                  <p className="text-gray-500 text-sm py-4 text-center"><Loader2 size={16} className="animate-spin inline mr-2" />読み込み中…</p>
                ) : (igItems ?? []).length === 0 ? (
                  <p className="text-gray-600 text-sm py-4 text-center">過去の投稿が見つかりません</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 max-h-64 overflow-y-auto pr-1">
                    {(igItems ?? []).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedIg(selectedIg?.id === m.id ? null : m)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-neutral-900 ${
                          selectedIg?.id === m.id ? "border-pink-500" : "border-transparent hover:border-neutral-600"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.mediaType === "VIDEO" ? (m.thumbnailUrl ?? m.mediaUrl) : m.mediaUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {m.mediaType === "VIDEO" && (
                          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-semibold px-1 rounded flex items-center gap-0.5">
                            <Film size={9} />動画
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className={`flex items-center gap-2.5 ${selectedIsVideo ? "opacity-40" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={overlay && !selectedIsVideo}
                disabled={selectedIsVideo}
                onChange={(e) => setOverlay(e.target.checked)}
                className="w-4 h-4 accent-pink-500"
              />
              <span className="text-sm text-white">
                AIがコピー（文字）を考えて画像に載せる
                {selectedIsVideo && <span className="text-gray-500 text-xs ml-2">※動画はそのまま投稿されます</span>}
              </span>
            </label>
            {overlay && !selectedIsVideo && (
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={2}
                placeholder="コピーの方向性（任意）例: 新商品の入荷告知として / 週末セールの案内"
                className="w-full bg-black border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
              />
            )}
            <button
              onClick={createFromMedia}
              disabled={generating || accounts.length === 0}
              className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {generating ? "作成中…" : "この素材でストーリーズを作成"}
            </button>
          </>
        )}
      </div>

      {created && (
        <div className="mt-6">
          <StoryPanel
            key={created.id}
            story={created}
            onClose={() => setCreated(null)}
            onMutated={(next) => setCreated(next)}
            onToast={showToast}
          />
        </div>
      )}
    </div>
  );
}
