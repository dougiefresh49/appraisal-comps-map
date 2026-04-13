"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import {
  ChevronDownIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "~/components/ThemeProvider";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  fileLooksLikeAcceptedAttachment,
  isAcceptableChatAttachmentFile,
} from "~/lib/chat-attachments-constants";
import {
  CHAT_MODEL_PRESET_HINTS,
  CHAT_MODEL_PRESET_IDS,
  CHAT_MODEL_PRESET_LABELS,
  DEFAULT_CHAT_MODEL_PRESET,
  type ChatModelPresetId,
} from "~/lib/chat-model-presets";

export type { ChatModelPresetId };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MentionEntity {
  type: "doc" | "comp" | "project";
  id: string;
  label: string;
  /** Secondary info — document type, comp type, or city */
  badge?: string;
}

export interface ResolvedMention {
  type: "doc" | "comp" | "project";
  id: string;
}

/** Passed from parent after a stopped stream so the composer can restore text, files, and model. */
export interface ComposerRestoreDraft {
  token: number;
  text: string;
  files: File[];
  modelPreset: ChatModelPresetId;
}

interface MentionComposerProps {
  entities: MentionEntity[];
  onSend: (
    text: string,
    mentions: ResolvedMention[],
    files: File[],
    modelPreset: ChatModelPresetId,
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  /** While the assistant is streaming, show a stop control instead of send. */
  isStreaming?: boolean;
  onStop?: () => void;
  restoreDraft?: ComposerRestoreDraft | null;
  onRestoreConsumed?: () => void;
}

// ---------------------------------------------------------------------------
// Token format: @[label](type:id)
// ---------------------------------------------------------------------------

const MENTION_RE = /@\[([^\]]+)\]\((doc|comp|project):([^)]+)\)/g;

export function parseMentions(text: string): ResolvedMention[] {
  const mentions: ResolvedMention[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    mentions.push({ type: match[2] as "doc" | "comp" | "project", id: match[3]! });
  }
  return mentions;
}

/** Strip mention tokens to plain display text for the API message. */
export function stripMentionTokens(text: string): string {
  return text.replace(MENTION_RE, "@$1");
}

function fileKey(f: File): string {
  return `${f.name}-${f.size}-${f.lastModified}`;
}

function PendingFilePreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const isImg = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImg) return;
    const u = URL.createObjectURL(file);
    setThumb(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImg]);

  return (
    <div
      className="flex max-w-[220px] items-center gap-2 rounded-xl bg-white/70 px-2 py-1.5 ring-1 ring-gray-200/80 dark:bg-gray-800/50 dark:ring-gray-600/40"
    >
      {isImg && thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-9 w-9 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-red-600/90 text-[10px] font-bold text-white">
          PDF
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-gray-800 dark:text-gray-200">
        {file.name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        aria-label={`Remove ${file.name}`}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MentionComposer({
  entities,
  onSend,
  disabled = false,
  placeholder = "Ask about your project data... use @ to reference docs, comps, or reports",
  isStreaming = false,
  onStop,
  restoreDraft,
  onRestoreConsumed,
}: MentionComposerProps) {
  const { theme } = useTheme();
  const [value, setValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [modelPreset, setModelPreset] =
    useState<ChatModelPresetId>(DEFAULT_CHAT_MODEL_PRESET);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    setAttachError(null);
    const good = incoming.filter(fileLooksLikeAcceptedAttachment);
    if (good.length === 0 && incoming.length > 0) {
      setAttachError("Only images (PNG, JPEG, GIF, WebP) or PDF, max 10MB each.");
      return;
    }

    setPendingFiles((prev) => {
      const next = [...prev];
      let err: string | null = null;
      for (const f of good) {
        if (!isAcceptableChatAttachmentFile(f)) continue;
        if (next.length >= CHAT_ATTACHMENT_MAX_FILES) {
          err = `At most ${CHAT_ATTACHMENT_MAX_FILES} files per message.`;
          break;
        }
        if (f.size > CHAT_ATTACHMENT_MAX_BYTES) {
          err = `"${f.name}" is larger than 10MB.`;
          continue;
        }
        if (next.some((x) => fileKey(x) === fileKey(f))) continue;
        next.push(f);
      }
      if (err) {
        setTimeout(() => setAttachError(err), 0);
      }
      return next;
    });
  }, []);

  const removeFile = useCallback((f: File) => {
    setPendingFiles((prev) => prev.filter((x) => fileKey(x) !== fileKey(f)));
  }, []);

  // Filter entities by the query typed after @
  const filtered = query
    ? entities.filter((e) =>
        e.label.toLowerCase().includes(query.toLowerCase()),
      )
    : entities;

  const visibleItems = filtered.slice(0, 12);

  // Keep selectedIdx in bounds
  useEffect(() => {
    if (selectedIdx >= visibleItems.length) {
      setSelectedIdx(Math.max(0, visibleItems.length - 1));
    }
  }, [visibleItems.length, selectedIdx]);

  // Scroll selected item into view
  useEffect(() => {
    if (!dropdownRef.current) return;
    const el = dropdownRef.current.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // After user stops streaming, parent reapplies the sent message into the composer.
  useEffect(() => {
    if (!restoreDraft) return;
    setValue(restoreDraft.text);
    setPendingFiles(restoreDraft.files);
    setModelPreset(restoreDraft.modelPreset);
    setShowDropdown(false);
    setAttachError(null);
    onRestoreConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per restore token
  }, [restoreDraft?.token]);

  const insertMention = useCallback(
    (entity: MentionEntity) => {
      if (mentionStartPos === null) return;
      const before = value.slice(0, mentionStartPos);
      const afterCursor = textareaRef.current?.selectionEnd ?? value.length;
      const after = value.slice(afterCursor);
      const token = `@[${entity.label}](${entity.type}:${entity.id}) `;
      const newValue = before + token + after;
      setValue(newValue);
      setShowDropdown(false);
      setQuery("");
      setMentionStartPos(null);

      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          const cursorPos = before.length + token.length;
          ta.selectionStart = cursorPos;
          ta.selectionEnd = cursorPos;
          ta.focus();
        }
      });
    },
    [value, mentionStartPos],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setValue(newVal);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newVal.slice(0, cursorPos);

      // Find the last unmatched @ before cursor
      const lastAt = textBeforeCursor.lastIndexOf("@");
      if (lastAt === -1) {
        setShowDropdown(false);
        setMentionStartPos(null);
        return;
      }

      // Check that this @ is at start or preceded by whitespace
      if (lastAt > 0 && !/\s/.test(textBeforeCursor[lastAt - 1]!)) {
        setShowDropdown(false);
        setMentionStartPos(null);
        return;
      }

      // Check this @ isn't already part of a completed token
      const afterAt = textBeforeCursor.slice(lastAt);
      if (/^@\[[^\]]+\]\([^)]+\)/.test(afterAt)) {
        setShowDropdown(false);
        setMentionStartPos(null);
        return;
      }

      const searchText = textBeforeCursor.slice(lastAt + 1);
      // Close dropdown if user typed too much without selecting
      if (searchText.length > 60) {
        setShowDropdown(false);
        return;
      }

      setMentionStartPos(lastAt);
      setQuery(searchText);
      setShowDropdown(true);
      setSelectedIdx(0);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown && visibleItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, visibleItems.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const item = visibleItems[selectedIdx];
          if (item) insertMention(item);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }

      // Send on Enter (without shift)
      if (e.key === "Enter" && !e.shiftKey && !showDropdown) {
        e.preventDefault();
        handleSend();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showDropdown, visibleItems, selectedIdx, insertMention],
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (disabled) return;
    if (!trimmed && pendingFiles.length === 0) return;
    const mentions = parseMentions(trimmed);
    onSend(trimmed, mentions, pendingFiles, modelPreset);
    setValue("");
    setShowDropdown(false);
    setPendingFiles([]);
    setAttachError(null);
  }, [value, disabled, onSend, pendingFiles, modelPreset]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.files;
      if (!items?.length) return;
      const files = Array.from(items).filter(fileLooksLikeAcceptedAttachment);
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    },
    [addFiles],
  );

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = !disabled && (value.trim().length > 0 || pendingFiles.length > 0);
  const showStop = Boolean(isStreaming && onStop);

  return (
    <div className="relative">
      {/* Mention dropdown */}
      {showDropdown && visibleItems.length > 0 && (
        <div
          ref={dropdownRef}
          data-color-mode={theme}
          className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {visibleItems.map((entity, idx) => (
            <button
              key={`${entity.type}-${entity.id}`}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                idx === selectedIdx
                  ? "bg-blue-100 text-gray-900 dark:bg-blue-600/20 dark:text-gray-100"
                  : "text-gray-800 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(entity);
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  entity.type === "doc"
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300"
                    : entity.type === "project"
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300"
                }`}
              >
                {entity.type === "doc" ? "doc" : entity.type === "project" ? "report" : "comp"}
              </span>
              <span className="min-w-0 flex-1 truncate">{entity.label}</span>
              {entity.badge && (
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-500">
                  {entity.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {attachError ? (
        <p className="mb-1.5 text-xs text-amber-700 dark:text-amber-400/90">
          {attachError}
        </p>
      ) : null}

      {/* Composer — Gemini-style: message area + bottom toolbar */}
      <div
        className={[
          "flex flex-col overflow-hidden rounded-3xl",
          "bg-white/95 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_4px_16px_-4px_rgba(15,23,42,0.06)]",
          "dark:bg-gray-900/85 dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.45),0_8px_28px_-6px_rgba(0,0,0,0.35)]",
          "transition-shadow duration-200 focus-within:shadow-[0_4px_14px_-2px_rgba(15,23,42,0.12),0_8px_24px_-4px_rgba(37,99,235,0.08)]",
          "dark:focus-within:shadow-[0_4px_18px_-2px_rgba(0,0,0,0.55),0_8px_28px_-6px_rgba(59,130,246,0.12)]",
          isDragging
            ? "shadow-[0_4px_16px_-2px_rgba(37,99,235,0.2),0_8px_28px_-4px_rgba(37,99,235,0.12)] dark:shadow-[0_4px_20px_-2px_rgba(59,130,246,0.25)]"
            : "",
        ].join(" ")}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          const files = Array.from(e.dataTransfer?.files ?? []).filter(
            fileLooksLikeAcceptedAttachment,
          );
          if (files.length) addFiles(files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.pdf"
          multiple
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) addFiles(Array.from(list));
            e.target.value = "";
          }}
        />

        <div className="flex flex-col px-3.5 pb-1.5 pt-3 sm:px-4">
          {pendingFiles.length > 0 ? (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {pendingFiles.map((f) => (
                <PendingFilePreview
                  key={fileKey(f)}
                  file={f}
                  onRemove={() => removeFile(f)}
                />
              ))}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="max-h-40 min-h-[3rem] w-full resize-none bg-transparent text-sm leading-5 text-gray-900 placeholder-gray-500 outline-none disabled:opacity-50 dark:text-gray-100 dark:placeholder-gray-500"
          />

          <div className="mt-2 flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  disabled || pendingFiles.length >= CHAT_ATTACHMENT_MAX_FILES
                }
                className="shrink-0 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200/90 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Attach file"
                title="Attach images or PDF (max 5, 10MB each)"
              >
                <PaperClipIcon className="h-[18px] w-[18px]" />
              </button>
              <div className="relative w-[112px] shrink-0">
                <label htmlFor="chat-model-preset" className="sr-only">
                  Model
                </label>
                <select
                  id="chat-model-preset"
                  value={modelPreset}
                  onChange={(e) =>
                    setModelPreset(e.target.value as ChatModelPresetId)
                  }
                  disabled={disabled}
                  className="h-9 w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent py-1.5 pl-3 pr-8 text-xs font-medium text-gray-500 shadow-none outline-none ring-0 transition-colors hover:bg-gray-200/90 focus-visible:ring-2 focus-visible:ring-blue-500/35 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800/90 dark:focus-visible:ring-blue-500/30"
                >
                  {CHAT_MODEL_PRESET_IDS.map((id) => (
                    <option
                      key={id}
                      value={id}
                      title={CHAT_MODEL_PRESET_HINTS[id]}
                    >
                      {CHAT_MODEL_PRESET_LABELS[id]}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon
                  className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                  aria-hidden
                />
              </div>
            </div>

            {showStop ? (
              <button
                type="button"
                onClick={onStop}
                className="shrink-0 rounded-full p-2 text-red-600 transition-colors hover:bg-red-100/90 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <StopIcon className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="shrink-0 rounded-full p-2 text-blue-600 transition-colors hover:bg-blue-100/90 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent dark:text-blue-400 dark:hover:bg-blue-900/35 dark:hover:text-blue-300 dark:disabled:text-gray-600"
                aria-label="Send message"
              >
                <PaperAirplaneIcon className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
