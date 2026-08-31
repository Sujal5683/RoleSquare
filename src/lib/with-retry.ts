/**
 * withRetry — wraps any async function with exponential-backoff retry logic
 * for transient network-level errors.
 *
 * Retryable errors (network drops, TCP resets, institutional firewall kills):
 *   - TypeError: Failed to fetch / Load failed / NetworkError (browser fetch)
 *   - ECONNRESET, ECONNABORTED, EPIPE, ETIMEDOUT (Node.js TCP)
 *   - "wsarecv" / "forcibly closed" (Windows TCP stack errors)
 *   - "stream reading error" (Google API mid-stream abort)
 *
 * NOT retried: HTTP application errors (4xx, 5xx), GeminiRateLimitExhaustedError
 * (those are handled at the BullMQ / React Query layer).
 */

export interface WithRetryOptions {
  /** Max number of attempts (default: 4 = 1 initial + 3 retries) */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff (default: 500ms) */
  baseDelayMs?: number;
  /** Max delay cap in ms (default: 15_000ms) */
  maxDelayMs?: number;
  /** Optional label for logging */
  label?: string;
  /** Optional signal to abort all retries early */
  signal?: AbortSignal;
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    // Browser fetch network failures
    msg.includes('failed to fetch')         ||
    msg.includes('load failed')             ||
    msg.includes('networkerror')            ||
    msg.includes('network request failed')  ||
    // Node.js TCP-level errors
    msg.includes('econnreset')             ||
    msg.includes('econnaborted')           ||
    msg.includes('econnrefused')           ||
    msg.includes('epipe')                  ||
    msg.includes('etimedout')              ||
    msg.includes('socket hang up')         ||
    // Windows-specific TCP stack errors
    msg.includes('wsarecv')               ||
    msg.includes('wsasend')               ||
    msg.includes('forcibly closed')        ||
    msg.includes('established connection was aborted') ||
    // Google API streaming errors
    msg.includes('stream reading error')   ||
    msg.includes('stream error')           ||
    // Generic timeout
    msg.includes('timeout')
  );
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Retry aborted'));
    }, { once: true });
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 500,
    maxDelayMs  = 15_000,
    label       = 'operation',
    signal,
  } = opts;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    signal?.throwIfAborted?.();

    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Only retry on network-level errors
      if (!isNetworkError(err)) throw err;

      // Last attempt — don't wait, just throw
      if (attempt === maxAttempts) break;

      // Jittered exponential backoff: baseDelay * 2^(attempt-1) + random 0-200ms
      const backoff = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter  = Math.random() * 200;
      const wait    = Math.round(backoff + jitter);

      console.warn(
        `[withRetry] ${label} attempt ${attempt}/${maxAttempts} failed (${(err as Error).message}). ` +
        `Retrying in ${wait}ms…`
      );

      await delay(wait, signal);
    }
  }

  throw lastError;
}
