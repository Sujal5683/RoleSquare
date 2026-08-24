"use client";

// DestructiveChangeConfirmation
// Reusable dialog for any action that could permanently destroy data.
// For the highest-risk operations (e.g., REPLACE import, schema rollback),
// requires the user to type a confirmation word before enabling the confirm button.

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface AffectedItem {
  label: string;
  count?: number;
}

interface DestructiveChangeConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  affectedItems?: AffectedItem[];
  /** If provided, user must type this word exactly to confirm (e.g. "DELETE", "REPLACE") */
  confirmWord?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DestructiveChangeConfirmation({
  open,
  onOpenChange,
  title,
  description,
  affectedItems = [],
  confirmWord,
  confirmLabel = "Confirm",
  onConfirm,
  isLoading = false,
}: DestructiveChangeConfirmationProps) {
  const [typed, setTyped] = useState("");
  const isConfirmEnabled = confirmWord
    ? typed.trim().toUpperCase() === confirmWord.toUpperCase()
    : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        {affectedItems.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1.5">
            <p className="text-xs font-medium text-red-400 uppercase tracking-wide">
              This action will affect:
            </p>
            {affectedItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                {item.count !== undefined && (
                  <Badge variant="outline" className="text-red-400 border-red-500/30">
                    {item.count.toLocaleString()}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {confirmWord && (
          <div className="space-y-2">
            <Label htmlFor="confirm-word" className="text-sm text-muted-foreground">
              Type{" "}
              <code className="rounded bg-red-500/10 px-1 py-0.5 text-red-400 font-mono text-xs">
                {confirmWord}
              </code>{" "}
              to confirm:
            </Label>
            <Input
              id="confirm-word"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              className="font-mono border-red-500/30 focus:border-red-500/60"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!isConfirmEnabled || isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "Processing…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
