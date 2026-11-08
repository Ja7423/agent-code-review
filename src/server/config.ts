/** Every tunable number lives here so logic never hard-codes magic values. */
export const config = {
  MAX_INLINE_PROMPT_BYTES: 32_768,
  CONTEXT_LINES: 3,
  WATCH_DEBOUNCE_MS: 300,
  LARGE_FILE_CHANGED_LINES: 1500,
  MAX_UNTRACKED_FILES: 200,
  PROMPT_ACK_TIMEOUT_MS: 10_000,
  AGENT_POLL_INTERVAL_MS: 5_000,
  HERDR_RECONNECT_MIN_MS: 500,
  HERDR_RECONNECT_MAX_MS: 30_000,
  HERDR_REQUEST_TIMEOUT_MS: 15_000,
  SQLITE_BUSY_TIMEOUT_MS: 5_000,
  GIT_MAX_BUFFER_BYTES: 256 * 1024 * 1024,
  REPLY_BODY_MAX_BYTES: 64 * 1024,
  COMMENT_BODY_MAX_BYTES: 64 * 1024,
  SSE_KEEPALIVE_MS: 25_000,
} as const;

export const BASE_FALLBACKS = ['main', 'master'] as const;
export const REPLY_COMMAND = 'revi reply';
/** File name of the prompt template, both shipped in `templates/` and as the user's override. */
export const PROMPT_TEMPLATE_FILE = 'review-prompt.md';
