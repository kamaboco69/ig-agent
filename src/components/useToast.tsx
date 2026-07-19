"use client";

import { useCallback, useState } from "react";

export interface ToastState {
  kind: "ok" | "error";
  text: string;
}

// 画面上部に出す簡易トースト。initial を渡すとマウント直後から表示（連携コールバック用）。
export function useToast(initial: ToastState | null = null) {
  const [toast, setToast] = useState<ToastState | null>(initial);

  const showToast = useCallback((kind: "ok" | "error", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 6000);
  }, []);

  const toastEl = toast ? (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${
        toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {toast.text}
    </div>
  ) : null;

  return { showToast, toastEl, dismissToast: () => setToast(null) };
}
