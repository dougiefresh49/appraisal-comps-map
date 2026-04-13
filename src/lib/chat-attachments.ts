import "server-only";

import type { Part } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatAttachment } from "~/types/chat";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
} from "~/lib/chat-attachments-constants";

export { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_MAX_FILES };

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

/** Reject path traversal and odd names; keep extension. */
function safeStorageSegment(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return base.length > 0 ? base : "file";
}

export function assertChatAttachmentAcceptable(
  file: File,
  index: number,
): void {
  if (index >= CHAT_ATTACHMENT_MAX_FILES) {
    throw new Error(
      `At most ${CHAT_ATTACHMENT_MAX_FILES} attachment(s) per message.`,
    );
  }
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error(
      `File "${file.name}" exceeds ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024}MB.`,
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error(
      `Unsupported type for "${file.name}". Use images (PNG, JPEG, GIF, WebP) or PDF.`,
    );
  }
}

export async function fileToGeminiPart(file: File): Promise<Part> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime =
    file.type && ALLOWED_MIME.has(file.type)
      ? file.type
      : "application/octet-stream";
  return {
    inlineData: {
      data: buf.toString("base64"),
      mimeType: mime,
    },
  };
}

export async function uploadChatAttachment(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  file: File,
  uniqueSuffix: string,
  fileIndex: number,
): Promise<ChatAttachment> {
  assertChatAttachmentAcceptable(file, fileIndex);

  const safe = safeStorageSegment(file.name);
  const storagePath = `${userId}/${projectId}/${uniqueSuffix}-${safe}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime =
    file.type && ALLOWED_MIME.has(file.type)
      ? file.type
      : "application/octet-stream";

  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(storagePath, bytes, {
      contentType: mime,
      upsert: false,
    });

  if (error) {
    console.error("[uploadChatAttachment]", error);
    throw new Error(
      `Could not upload "${file.name}": ${error.message}`,
    );
  }

  return {
    fileName: file.name,
    mimeType: mime,
    storagePath,
    size: file.size,
  };
}

export async function uploadChatAttachments(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  files: File[],
): Promise<ChatAttachment[]> {
  if (files.length > CHAT_ATTACHMENT_MAX_FILES) {
    throw new Error(
      `At most ${CHAT_ATTACHMENT_MAX_FILES} attachment(s) per message.`,
    );
  }
  const base = `${Date.now()}`;
  const out: ChatAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    assertChatAttachmentAcceptable(f, i);
    out.push(
      await uploadChatAttachment(
        supabase,
        userId,
        projectId,
        f,
        `${base}-${i}`,
        i,
      ),
    );
  }
  return out;
}
