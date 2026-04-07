/**
 * Limits concurrent Google Drive thumbnail loads (drive.google.com/thumbnail → lh3.googleusercontent.com)
 * to reduce 429 Too Many Requests from per-IP rate limits.
 */
const MAX_CONCURRENT = 4;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;
const ERROR_WINDOW_MS = 2_000;
const ERRORS_BEFORE_BACKOFF = 3;

class ThumbnailQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private backoffUntil = 0;
  private backoffMs = INITIAL_BACKOFF_MS;
  private errorTimestamps: number[] = [];

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sleepUntilBackoffClear(): Promise<void> {
    const now = Date.now();
    if (now < this.backoffUntil) {
      await this.sleep(this.backoffUntil - now);
    }
  }

  /** Next acquire() waits until backoff expires; doubles up to MAX_BACKOFF_MS until a successful load resets it. */
  private applyBackoff(): void {
    const now = Date.now();
    this.backoffUntil = Math.max(
      this.backoffUntil,
      now + this.backoffMs,
    );
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  /** Call when an image finishes loading successfully. Resets error streak and backoff growth. */
  recordSuccess(): void {
    this.errorTimestamps = [];
    this.backoffMs = INITIAL_BACKOFF_MS;
  }

  /**
   * Call when an image fails to load. If many failures occur in a short window, pause the whole queue.
   * Returns whether queue-wide backoff was applied (same as “suspected rate limit”).
   */
  recordLoadError(): boolean {
    const now = Date.now();
    this.errorTimestamps = this.errorTimestamps.filter(
      (t) => now - t < ERROR_WINDOW_MS,
    );
    this.errorTimestamps.push(now);
    if (this.errorTimestamps.length >= ERRORS_BEFORE_BACKOFF) {
      this.errorTimestamps = [];
      this.applyBackoff();
      return true;
    }
    return false;
  }

  /** Wait for global backoff (if any), then wait for a free slot (max MAX_CONCURRENT in flight). */
  async acquire(): Promise<void> {
    await this.sleepUntilBackoffClear();

    return new Promise((resolve) => {
      const grant = () => {
        this.active++;
        resolve();
      };

      if (this.active < MAX_CONCURRENT) {
        grant();
      } else {
        this.waiting.push(grant);
      }
    });
  }

  /** Free one in-flight slot (after `acquire`). Backoff is applied via `recordLoadError()` when failures cluster. */
  release(): void {
    this.active = Math.max(0, this.active - 1);

    void this.drainWaiting();
  }

  private async drainWaiting(): Promise<void> {
    await this.sleepUntilBackoffClear();
    while (this.waiting.length > 0 && this.active < MAX_CONCURRENT) {
      const grant = this.waiting.shift();
      grant?.();
    }
  }
}

export const thumbnailQueue = new ThumbnailQueue();
