"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useAuth } from "~/hooks/useAuth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function LoginContent() {
  const { user, isLoading, signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/projects");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#030712]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(34,211,238,0.22),transparent)] dark:bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(34,211,238,0.18),transparent)]"
          aria-hidden
        />
        <div className="relative text-sm font-medium text-slate-500 dark:text-cyan-200/70">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 bg-slate-50 dark:bg-[#030712]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-30%,rgba(6,182,212,0.2),transparent)] dark:bg-[radial-gradient(ellipse_80%_55%_at_50%_-15%,rgba(34,211,238,0.16),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_100%,rgba(14,165,233,0.08),transparent_45%)] dark:bg-[radial-gradient(circle_at_0%_100%,rgba(34,211,238,0.06),transparent_40%)]"
        aria-hidden
      />

      <div className="relative flex w-full max-w-md flex-col items-center gap-10">
        <Image
          src="/appraisalbot-reports-logo.png"
          alt="AppraisalBot Reports"
          width={449}
          height={250}
          className="h-auto w-full max-w-[min(100%,320px)]"
          priority
        />

        {authError && (
          <div className="w-full rounded-lg bg-red-50/90 px-3 py-2.5 text-center text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            Authentication failed. Please try again.
          </div>
        )}

        <button
          type="button"
          onClick={() => void signIn()}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm font-medium text-slate-800 shadow-md shadow-slate-900/10 transition hover:bg-cyan-50/90 hover:shadow-lg hover:shadow-cyan-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 dark:bg-white/10 dark:text-cyan-50 dark:shadow-none dark:hover:bg-white/15"
        >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#030712]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(34,211,238,0.22),transparent)] dark:bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(34,211,238,0.18),transparent)]"
            aria-hidden
          />
          <div className="relative text-sm font-medium text-slate-500 dark:text-cyan-200/70">
            Loading…
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
