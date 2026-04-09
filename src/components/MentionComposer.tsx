"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { useTheme } from "~/components/ThemeProvider";

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

interface MentionComposerProps {
  entities: MentionEntity[];
  onSend: (text: string, mentions: ResolvedMention[]) => void;
  disabled?: boolean;
  placeholder?: string;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MentionComposer({
  entities,
  onSend,
  disabled = false,
  placeholder = "Ask about your project data... use @ to reference docs, comps, or reports",
}: MentionComposerProps) {
  const { theme } = useTheme();
  const [value, setValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (!trimmed || disabled) return;
    const mentions = parseMentions(trimmed);
    onSend(trimmed, mentions);
    setValue("");
    setShowDropdown(false);
  }, [value, disabled, onSend]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

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

      {/* Composer */}
      <div className="flex items-end gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:focus-within:border-blue-600/50 dark:focus-within:ring-blue-600/30">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-500 outline-none disabled:opacity-50 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-md p-1.5 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent dark:text-blue-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:disabled:text-gray-600"
          aria-label="Send message"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
