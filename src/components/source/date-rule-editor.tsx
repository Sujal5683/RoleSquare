"use client";

// DateRuleEditor — rich date filter editor for source rules.
//
// Provides preset chips (Last 7 days, Last 30 days, Last 3 months, Last year,
// Custom range) and, when "Custom range" is selected, start/end date pickers.
//
// Emits a rule with:
//   filterType: "date"
//   operator:   "gt" | "lt" | "between"
//   value:      ISO date string (for gt/lt) or "" (for between, metadata carries range)
//   metadata:   { preset?, startDate?, endDate? }

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DatePreset = "last_7_days" | "last_30_days" | "last_3_months" | "last_year" | "custom";

export interface DateRuleValue {
  operator: "gt" | "lt" | "between";
  value: string;
  metadata: {
    preset?: DatePreset;
    startDate?: string;
    endDate?: string;
  };
}

interface DateRuleEditorProps {
  initialValue?: DateRuleValue;
  onChange: (value: DateRuleValue) => void;
}

const PRESETS: { id: DatePreset; label: string; days?: number }[] = [
  { id: "last_7_days", label: "Last 7 days", days: 7 },
  { id: "last_30_days", label: "Last 30 days", days: 30 },
  { id: "last_3_months", label: "Last 3 months", days: 90 },
  { id: "last_year", label: "Last year", days: 365 },
  { id: "custom", label: "Custom range" },
];

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function DateRuleEditor({ initialValue, onChange }: DateRuleEditorProps) {
  const [preset, setPreset] = useState<DatePreset>(
    initialValue?.metadata?.preset ?? "last_30_days"
  );
  const [startDate, setStartDate] = useState<string>(
    initialValue?.metadata?.startDate ?? daysAgoISO(30)
  );
  const [endDate, setEndDate] = useState<string>(
    initialValue?.metadata?.endDate ?? new Date().toISOString().slice(0, 10)
  );

  function emit(p: DatePreset, sd: string, ed: string) {
    if (p === "custom") {
      onChange({
        operator: "between",
        value: sd,
        metadata: { preset: "custom", startDate: sd, endDate: ed },
      });
    } else {
      const found = PRESETS.find((x) => x.id === p);
      const ago = found?.days ? daysAgoISO(found.days) : daysAgoISO(30);
      onChange({
        operator: "gt",
        value: ago,
        metadata: { preset: p, startDate: ago },
      });
    }
  }

  function handlePresetClick(p: DatePreset) {
    setPreset(p);
    emit(p, startDate, endDate);
  }

  function handleStartDate(val: string) {
    setStartDate(val);
    emit(preset, val, endDate);
  }

  function handleEndDate(val: string) {
    setEndDate(val);
    emit(preset, startDate, val);
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant={preset === p.id ? "default" : "outline"}
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => handlePresetClick(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <Label htmlFor="date-rule-start" className="text-[10px]">
              Start date
            </Label>
            <Input
              id="date-rule-start"
              type="date"
              className="h-8 text-xs"
              value={startDate}
              max={endDate}
              onChange={(e) => handleStartDate(e.target.value)}
            />
          </div>
          <div className="mt-5 text-muted-foreground">→</div>
          <div className="space-y-1">
            <Label htmlFor="date-rule-end" className="text-[10px]">
              End date
            </Label>
            <Input
              id="date-rule-end"
              type="date"
              className="h-8 text-xs"
              value={endDate}
              min={startDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => handleEndDate(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
