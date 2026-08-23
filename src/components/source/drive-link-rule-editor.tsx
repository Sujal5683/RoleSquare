"use client";

// DriveLinkRuleEditor — yes/no toggle for "must contain Google Drive link" filter.
// Emits: { filterType: "drive_link", operator: "required", value: true | false }

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface DriveLinkRuleValue {
  filterType: "drive_link";
  operator: "required";
  value: boolean;
}

interface DriveLinkRuleEditorProps {
  value?: boolean;
  onChange: (rule: DriveLinkRuleValue) => void;
}

export function DriveLinkRuleEditor({ value = true, onChange }: DriveLinkRuleEditorProps) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <Label className="text-xs">Must contain Google Drive link</Label>
      <div className="flex gap-2 mt-1.5">
        <Button
          type="button"
          size="sm"
          variant={value ? "default" : "outline"}
          onClick={() => onChange({ filterType: "drive_link", operator: "required", value: true })}
          className="h-7 text-xs"
        >
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!value ? "default" : "outline"}
          onClick={() => onChange({ filterType: "drive_link", operator: "required", value: false })}
          className="h-7 text-xs"
        >
          No
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {value
          ? "Only include emails that contain at least one Google Drive link."
          : "Include emails regardless of Drive links."}
      </p>
    </div>
  );
}
