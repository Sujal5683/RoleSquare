/**
 * pending-action-card.tsx
 *
 * Renders an inline confirmation dialog inside a chat message bubble
 * when the AI assistant wants to perform a write action.
 *
 * Risk levels control color scheme:
 *   low    → blue (informational)
 *   medium → amber (caution)
 *   high   → red (danger) with extra permanent-data-loss warning
 */

"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingAction } from "./types";

interface PendingActionCardProps {
  action: PendingAction;
  resolved: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}

export function PendingActionCard({ action, resolved, onConfirm, onSkip }: PendingActionCardProps) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    onConfirm();
    // Note: we don't reset confirming because the parent will replace this card
  }

  if (resolved) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Action resolved
      </div>
    );
  }

  // Color tokens by risk level
  const riskConfig = {
    low: {
      border: "border-blue-200 dark:border-blue-800",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      icon: <ShieldAlert className="h-4 w-4 text-blue-500" />,
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      confirmClass: "bg-blue-600 hover:bg-blue-700 text-white",
      label: "Action",
    },
    medium: {
      border: "border-amber-200 dark:border-amber-800",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
      confirmClass: "bg-amber-600 hover:bg-amber-700 text-white",
      label: "Caution",
    },
    high: {
      border: "border-red-200 dark:border-red-800",
      bg: "bg-red-50 dark:bg-red-950/40",
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      confirmClass: "bg-red-600 hover:bg-red-700 text-white",
      label: "Destructive",
    },
  };

  const cfg = riskConfig[action.risk];

  return (
    <div className={cn("mt-3 rounded-xl border p-3 text-sm", cfg.border, cfg.bg)}>
      {/* Header row */}
      <div className="mb-2 flex items-center gap-2">
        {cfg.icon}
        <span className="font-semibold text-foreground">Confirm Action</span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Action label */}
      <p className="mb-1 text-foreground">{action.label}</p>

      {/* Extra warning for destructive actions */}
      {action.risk === "high" && (
        <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">
          ⚠️ This action may be permanent and cannot be fully reversed.
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            cfg.confirmClass,
            "disabled:opacity-60"
          )}
        >
          {confirming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Continue
        </button>
        <button
          onClick={onSkip}
          disabled={confirming}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <X className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>
    </div>
  );
}
