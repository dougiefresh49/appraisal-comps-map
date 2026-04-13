"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowRightStartOnRectangleIcon,
  ChartBarIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "~/components/ThemeProvider";
import { useAuth } from "~/hooks/useAuth";
import { UsageModal } from "~/components/UsageModal";

interface ProfileMenuProps {
  isCollapsed: boolean;
  /** Top navigation: menu opens below the trigger, aligned right — no sidebar chrome. */
  variant?: "sidebar" | "header";
}

export function ProfileMenu({
  isCollapsed,
  variant = "sidebar",
}: ProfileMenuProps) {
  const { user, signIn, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  const userInitial = user?.email ? user.email[0]?.toUpperCase() : null;
  const userEmail = user?.email ?? "";

  function handleToggleTheme() {
    toggleTheme();
    setIsOpen(false);
  }

  async function handleReconnectDrive() {
    setIsOpen(false);
    await signIn(pathname ?? "/projects");
  }

  async function handleSignOut() {
    setIsOpen(false);
    await signOut();
    router.replace("/login");
  }

  const isHeader = variant === "header";

  return (
    <div
      ref={containerRef}
      className={
        isHeader
          ? "relative"
          : "relative border-t border-gray-200 p-3 dark:border-gray-800"
      }
    >
      {/* Popup menu */}
      {isOpen && (
        <div
          className={
            isHeader
              ? "absolute top-full right-0 z-[70] mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              : "absolute bottom-full left-0 z-[70] mb-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          }
        >
          {/* User info */}
          <div className="relative px-4 py-3">
            {process.env.NEXT_PUBLIC_APP_VERSION && (
              <p className="absolute top-1 right-3 text-[11px] text-gray-400 dark:text-gray-500">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
            )}
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Signed in as
            </p>
            <p
              className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100"
              title={userEmail}
            >
              {userEmail || "Unknown"}
            </p>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700" />

          {/* Theme toggle */}
          <button
            onClick={handleToggleTheme}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {theme === "light" ? (
              <MoonIcon className="h-4 w-4 shrink-0" />
            ) : (
              <SunIcon className="h-4 w-4 shrink-0" />
            )}
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>

          {/* Reconnect Google Drive */}
          <button
            onClick={handleReconnectDrive}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowPathIcon className="h-4 w-4 shrink-0" />
            Reconnect Google Drive
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setUsageOpen(true);
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ChartBarIcon className="h-4 w-4 shrink-0" />
            Usage
          </button>

          <div className="border-t border-gray-100 dark:border-gray-700" />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <ArrowRightStartOnRectangleIcon className="h-4 w-4 shrink-0" />
            Sign out
          </button>

        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={
          isHeader
            ? `flex w-auto items-center gap-3 rounded-md px-1.5 py-1.5 transition hover:bg-gray-200 dark:hover:bg-gray-800 ${
                isCollapsed ? "justify-center" : ""
              }`
            : `flex w-full items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-gray-100 dark:hover:bg-gray-800 ${
                isCollapsed ? "justify-center" : ""
              }`
        }
        title={isCollapsed ? userEmail || "Profile" : undefined}
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Avatar */}
        {userInitial ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
            {userInitial}
          </span>
        ) : (
          <UserCircleIcon className="h-7 w-7 shrink-0 text-gray-500 dark:text-gray-400" />
        )}

        {/* Email + indicator (expanded only) */}
        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-sm text-gray-700 dark:text-gray-300">
              {userEmail || "Profile"}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ···
            </span>
          </>
        )}
      </button>

      <UsageModal isOpen={usageOpen} onClose={() => setUsageOpen(false)} />
    </div>
  );
}
