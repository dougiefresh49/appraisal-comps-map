"use client";

interface PresenceBannerProps {
  isOtherUserEditing: boolean;
  otherUserName: string | null;
}

export function PresenceBanner({
  isOtherUserEditing,
  otherUserName,
}: PresenceBannerProps) {
  if (!isOtherUserEditing) return null;

  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      {otherUserName ?? "Someone"} is also viewing this page
    </div>
  );
}
