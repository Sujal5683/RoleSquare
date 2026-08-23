"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Command as CommandIcon,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";

interface Shortcut {
  keys: { icon?: LucideIcon; text: string }[];
  description: string;
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Global",
    items: [
      {
        keys: [{ icon: CommandIcon, text: "" }, { icon: undefined, text: "K" }],
        description: "Open command palette",
      },
      {
        keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "T" }],
        description: "Toggle dark / light theme",
      },
      {
        keys: [{ icon: undefined, text: "?" }],
        description: "Show this help dialog",
      },
      {
        keys: [{ text: "Esc" }],
        description: "Close dialog or palette",
      },
    ],
  },
  {
    group: "Navigation",
    items: [
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "1" }], description: "Go to Dashboard" },
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "2" }], description: "Go to Sources" },
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "3" }], description: "Go to Datasets" },
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "4" }], description: "Go to Schema Builder" },
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "5" }], description: "Go to AI Studio" },
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "6" }], description: "Go to Sharing Center" },
      { keys: [{ icon: undefined, text: "Alt" }, { icon: undefined, text: "9" }], description: "Go to Settings" },
    ],
  },
  {
    group: "Command Palette",
    items: [
      { keys: [{ icon: ArrowUp, text: "" }, { icon: ArrowDown, text: "" }], description: "Navigate results" },
      { keys: [{ icon: CornerDownLeft, text: "" }], description: "Select result" },
    ],
  },
];

function KeyCap({ icon: Icon, text }: { icon?: LucideIcon; text: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
      {Icon && <Icon className="h-3 w-3" />}
      {text}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ? key (Shift+/)
      if (e.shiftKey && e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CommandIcon className="h-4 w-4" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Speed up your workflow with these keyboard shortcuts. Press{" "}
            <KeyCap text="?" /> anytime to open this reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {SHORTCUTS.map((section) => (
            <div key={section.group}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.group}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <span className="text-sm">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, j) => (
                        <KeyCap key={j} icon={key.icon} text={key.text} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separator />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Tip: Use the command palette (<KeyCap icon={CommandIcon} text="K" />) for
            quick access to everything.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
