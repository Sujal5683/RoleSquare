"use client";

// AttachmentRuleEditor — simple yes/no toggle for "must have attachment" filter.
// Emits: { filterType: "attachment", operator: "required", value: "true" | "false" }

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export interface AttachmentRuleValue {
  filterType: "attachment";
  operator: "required";
  value: boolean;
  metadata?: Record<string, unknown>;
}

interface AttachmentRuleEditorProps {
  value?: boolean;
  metadata?: Record<string, unknown>;
  onChange: (rule: AttachmentRuleValue) => void;
}

export function AttachmentRuleEditor({ value = true, metadata, onChange }: AttachmentRuleEditorProps) {
  const allowedExtensions = (metadata?.allowedExtensions as string) || "";

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div>
        <Label className="text-xs">Must have attachment</Label>
        <div className="flex gap-2 mt-1.5">
          <Button
            type="button"
            size="sm"
            variant={value ? "default" : "outline"}
            onClick={() => onChange({ filterType: "attachment", operator: "required", value: true, metadata })}
            className="h-7 text-xs"
          >
            Yes
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!value ? "default" : "outline"}
            onClick={() => onChange({ filterType: "attachment", operator: "required", value: false, metadata })}
            className="h-7 text-xs"
          >
            No
          </Button>
        </div>
      </div>
      
      {value && (
        <div className="space-y-1.5 pt-2 border-t">
          <Label className="text-[10px]">Allowed Extensions (optional, comma-separated)</Label>
          <Input 
            className="h-8 text-xs font-mono" 
            placeholder=".pdf, .csv, .docx" 
            value={allowedExtensions}
            onChange={(e) => onChange({ 
              filterType: "attachment", 
              operator: "required", 
              value: true, 
              metadata: { ...metadata, allowedExtensions: e.target.value }
            })}
          />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {value
          ? allowedExtensions 
            ? `Only include emails with attachments matching: ${allowedExtensions}`
            : "Only include emails that have at least one attachment."
          : "Include emails regardless of attachments."}
      </p>
    </div>
  );
}
