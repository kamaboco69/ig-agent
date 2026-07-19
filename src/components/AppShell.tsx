"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

// サイドバーを出さない（フルスクリーン表示の）ルート
const BARE_PREFIXES = ["/login", "/signup"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const bare = BARE_PREFIXES.some((p) => pathname.startsWith(p));

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 w-full overflow-x-hidden pb-20 md:pb-0">{children}</main>
    </div>
  );
}
