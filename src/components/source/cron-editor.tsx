"use client";

import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface CronEditorProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronEditor({ value, onChange }: CronEditorProps) {
  // A simple cron visualizer mapping UI state back to cron string
  // Supports: every X minutes, every X hours, daily at HH:MM
  
  const [mode, setMode] = useState<"minutes" | "hours" | "daily" | "custom">("custom");
  const [interval, setInterval] = useState<number>(15);
  const [time, setTime] = useState<string>("09:00");
  const [customCron, setCustomCron] = useState<string>(value || "*/15 * * * *");

  // Parse initial value loosely
  useEffect(() => {
    if (!value) return;
    setCustomCron(value);
    
    if (value.match(/^\*\/(\d+) \* \* \* \*$/)) {
      setMode("minutes");
      setInterval(parseInt(value.match(/^\*\/(\d+)/)![1], 10));
    } else if (value.match(/^0 \*\/(\d+) \* \* \*$/)) {
      setMode("hours");
      setInterval(parseInt(value.match(/^0 \*\/(\d+)/)![1], 10));
    } else if (value.match(/^(\d+) (\d+) \* \* \*$/)) {
      const match = value.match(/^(\d+) (\d+) \* \* \*$/)!;
      setMode("daily");
      const mm = match[1].padStart(2, "0");
      const hh = match[2].padStart(2, "0");
      setTime(`${hh}:${mm}`);
    } else {
      setMode("custom");
    }
  }, [value]);

  const updateCron = (newMode: string, newInterval: number, newTime: string) => {
    let cron = "";
    if (newMode === "minutes") cron = `*/${newInterval} * * * *`;
    else if (newMode === "hours") cron = `0 */${newInterval} * * *`;
    else if (newMode === "daily") {
      const [hh, mm] = newTime.split(":");
      cron = `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`;
    } else {
      cron = customCron;
    }
    onChange(cron);
  };

  const handleModeChange = (val: string) => {
    const m = val as any;
    setMode(m);
    updateCron(m, interval, time);
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) || 1;
    setInterval(val);
    updateCron(mode, val, time);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTime(val);
    updateCron(mode, interval, val);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomCron(val);
    onChange(val);
  };

  return (
    <div className="space-y-4 rounded-md border p-4 bg-muted/10">
      <div className="space-y-1.5">
        <Label className="text-xs">Frequency</Label>
        <Select value={mode} onValueChange={handleModeChange}>
          <SelectTrigger className="h-8 text-xs w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">Every X minutes</SelectItem>
            <SelectItem value="hours">Every X hours</SelectItem>
            <SelectItem value="daily">Daily at specific time</SelectItem>
            <SelectItem value="custom">Custom Cron Expression</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "minutes" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Run every</span>
          <Input type="number" min="1" max="59" value={interval} onChange={handleIntervalChange} className="h-8 w-20 text-xs" />
          <span className="text-xs text-muted-foreground">minutes</span>
        </div>
      )}

      {mode === "hours" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Run every</span>
          <Input type="number" min="1" max="23" value={interval} onChange={handleIntervalChange} className="h-8 w-20 text-xs" />
          <span className="text-xs text-muted-foreground">hours</span>
        </div>
      )}

      {mode === "daily" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Run daily at</span>
          <Input type="time" value={time} onChange={handleTimeChange} className="h-8 w-32 text-xs" />
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Cron Expression</Label>
          <Input value={customCron} onChange={handleCustomChange} className="h-8 text-xs font-mono" placeholder="* * * * *" />
          <p className="text-[10px] text-muted-foreground">Use standard 5-field cron format (minute hour day month day-of-week).</p>
        </div>
      )}
      
      <div className="mt-2 text-[10px] bg-background border px-2 py-1.5 rounded inline-flex font-mono text-muted-foreground">
        Output: {value || "* * * * *"}
      </div>
    </div>
  );
}
