"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Images, LogOut, Repeat, Settings, Sparkles } from "lucide-react";

const NAV = [
  { href: "/", label: "作成", icon: Sparkles },
  { href: "/stories", label: "ストーリーズ", icon: Images },
  { href: "/recurring", label: "定期配信", icon: Repeat },
  { href: "/settings", label: "設定", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {/* デスクトップ: 左レール */}
      <aside className="hidden md:flex flex-col w-56 flex-none border-r border-neutral-900 h-screen sticky top-0 p-4">
        <Link href="/" className="flex items-center gap-2.5 px-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-black">
            IG
          </div>
          <div>
            <p className="text-white font-bold leading-tight">IG Agent</p>
            <p className="text-gray-600 text-[10px]">ストーリーズ自動運用</p>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-pink-500/10 text-white border border-pink-500/40"
                    : "text-gray-400 hover:text-white hover:bg-neutral-900 border border-transparent"
                }`}
              >
                <item.icon size={16} className={active ? "text-pink-400" : ""} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:text-white hover:bg-neutral-900 transition-colors"
        >
          <LogOut size={16} /> ログアウト
        </button>
      </aside>

      {/* モバイル: 下部ナビ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-black/95 backdrop-blur border-t border-neutral-800 safe-area-bottom">
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                  active ? "text-pink-400" : "text-gray-500"
                }`}
              >
                <item.icon size={19} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
