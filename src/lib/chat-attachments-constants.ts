/** Client-safe limits (mirrors server `chat-attachments.ts`). */

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_FILES = 5;

const ACCEPTED_EXT = /\.(png|jpe?g|gif|webp|pdf)$/i;

export function isAcceptableChatAttachmentFile(file: File): boolean {
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return false;
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) {
    return /image\/(png|jpeg|jpg|gif|webp)/.test(mime);
  }
  return mime === "application/pdf";
}

export function fileLooksLikeAcceptedAttachment(file: File): boolean {
  if (file.type) return isAcceptableChatAttachmentFile(file);
  return ACCEPTED_EXT.test(file.name ?? "");
}
