"use client";

import Image from "next/image";
import Link from "next/link";
import { ProfileMenu } from "~/components/ProfileMenu";

export function AppSiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/90 shadow-[0_1px_0_rgba(6,182,212,0.06)] backdrop-blur-md dark:border-cyan-500/20 dark:bg-[#050d18]/95 dark:shadow-[0_1px_0_rgba(34,211,238,0.12)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/projects"
          className="group flex items-center gap-2.5 rounded-lg p-1 outline-offset-2 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          aria-label="AppraisalBot Reports — Projects"
        >
          <Image
            src="/logo128.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-md shadow-[0_0_24px_-4px_rgba(34,211,238,0.45)] ring-1 ring-cyan-400/25 transition group-hover:ring-cyan-400/40"
            priority
          />
          <span className="hidden bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-sm font-semibold tracking-tight text-transparent sm:inline dark:from-cyan-100 dark:to-sky-300">
            AppraisalBot Reports
          </span>
        </Link>
        <ProfileMenu isCollapsed variant="header" />
      </div>
    </header>
  );
}
