"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewShareRequestDialog } from "@/components/sharing/new-share-request-dialog";
import type { DatasetDTO } from "@/lib/types";

interface ShareButtonProps {
  dataset: DatasetDTO;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  /** If true, only show the icon (no label). Default false. */
  iconOnly?: boolean;
}

/**
 * Reusable share button that opens the NewShareRequestDialog for a given dataset.
 * Disabled for shared datasets (you can't re-share what you don't own).
 */
export function ShareButton({
  dataset,
  variant = "outline",
  size = "sm",
  iconOnly = false,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const isOwner = !dataset.isShared;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={!isOwner}
        title={isOwner ? `Share "${dataset.name}"` : "You can only share datasets you own"}
        onClick={() => setOpen(true)}
      >
        <Share2 className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
        {!iconOnly && "Share"}
      </Button>

      <NewShareRequestDialog
        open={open}
        onOpenChange={setOpen}
        dataset={dataset}
      />
    </>
  );
}
