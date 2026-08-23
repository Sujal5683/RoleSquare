"use client";

// AttachmentRuleEditor — simple yes/no toggle for "must have attachment" filter.
// Emits: { filterType: "attachment", operator: "required", value: "true" | "false" }

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface AttachmentRuleValue {
  filterType: "attachment";
  operator: "required";
  value: boolean;
}

interface AttachmentRuleEditorProps {
  value?: boolean;
  onChange: (rule: AttachmentRuleValue) => void;
}

export function AttachmentRuleEditor({ value = true, onChange }: AttachmentRuleEditorProps) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <Label className="text-xs">Must have attachment</Label>
      <div className="flex gap-2 mt-1.5">
        <Button
          type="button"
          size="sm"
          variant={value ? "default" : "outline"}
          onClick={() => onChange({ filterType: "attachment", operator: "required", value: true })}
          className="h-7 text-xs"
        >
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!value ? "default" : "outline"}
          onClick={() => onChange({ filterType: "attachment", operator: "required", value: false })}
          className="h-7 text-xs"
        >
          No
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {value
          ? "Only include emails that have at least one attachment."
          : "Include emails regardless of attachments."}
      </p>
    </div>
  );
}
