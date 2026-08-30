/**
 * assistant/types.ts
 *
 * Shared type definitions for the AI assistant frontend.
 * These types mirror the DB model shapes but are client-safe (no encryption).
 */

// ── Quick reply chips ────────────────────────────────────────────────────

/** A quick-reply button shown below an assistant message. */
export interface QuickChip {
  label: string;
  value: string;
  variant: "default" | "destructive" | "outline";
  action?: "send" | "fill";
}

// ── Pending action (confirmation required) ───────────────────────────────

/**
 * A write action the AI wants to perform, awaiting user confirmation.
 * Shown as an inline confirmation card in the message bubble.
 */
export interface PendingAction {
  /** The tool name to execute on confirmation (e.g. "create_schema") */
  tool: string;
  /** Arguments that will be passed to the tool */
  args: Record<string, unknown>;
  /** Human-readable description shown in the card */
  label: string;
  /** Risk level controls card color and warning text */
  risk: "low" | "medium" | "high";
  /** Session ID where the result will be persisted */
  sessionId?: string;
}

// ── Message ──────────────────────────────────────────────────────────────

/** A single message turn in an assistant conversation. */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;

  /** Tool name called during this turn (for read tools only) */
  toolName?: string;
  /** Parsed tool execution result (displayed in collapsible block) */
  toolResult?: unknown;

  /** Gemini model used for this response */
  modelUsed?: string;

  /** True while the response is being streamed (shows cursor animation) */
  isStreaming?: boolean;

  /** Unix timestamp for display */
  timestamp: number;

  /** Quick-reply chips extracted from response markers */
  chips?: QuickChip[];

  /** A write action awaiting user confirmation */
  pendingAction?: PendingAction;

  /**
   * Undo token for a completed write action.
   * Present only when the action was confirmed and is undoable.
   */
  undoToken?: string;

  /**
   * Set when the model returned a malformed tool call JSON.
   * Triggers the "Parse error — Retry" banner in the message bubble.
   */
  retryAvailable?: boolean;

  /**
   * Whether the confirmation for this pending action has been resolved
   * (confirmed, skipped, or already executed). Prevents double-confirmation.
   */
  actionResolved?: boolean;
}

// ── Session ──────────────────────────────────────────────────────────────

/** A conversation session from the 7-day history. */
export interface AssistantSession {
  id: string;
  title: string;
  suggestionMode: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/** A session with its full message history (loaded on selection). */
export interface AssistantSessionDetail extends AssistantSession {
  messages: Message[];
}

// ── Activity log entry ───────────────────────────────────────────────────

/**
 * A record of a completed write action performed by the AI in the current session.
 * Used for the activity log drawer and undo functionality.
 */
export interface ActivityEntry {
  id: string;
  label: string;
  undoToken?: string;
  undone: boolean;
  timestamp: number;
}
