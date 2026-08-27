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
  
  const [mode, setMode] = useState<"minutes" | "hours" | "daily" | "weekly" | "monthly" | "custom">("custom");
  const [interval, setInterval] = useState<number>(15);
  const [time, setTime] = useState<string>("09:00");
  const [dayOfWeek, setDayOfWeek] = useState<string>("1");
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
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
    } else if (value.match(/^0 0 \* \* (\d+)$/)) {
      setMode("weekly");
      setDayOfWeek(value.match(/^0 0 \* \* (\d+)$/)![1]);
    } else if (value.match(/^0 0 (\d+) \* \*$/)) {
      setMode("monthly");
      setDayOfMonth(parseInt(value.match(/^0 0 (\d+) \* \*$/)![1], 10));
    } else {
      setMode("custom");
    }
  }, [value]);

  const updateCron = (newMode: string, newInterval: number, newTime: string, newDow: string, newDom: number) => {
    let cron = "";
    if (newMode === "minutes") cron = `*/${newInterval} * * * *`;
    else if (newMode === "hours") cron = `0 */${newInterval} * * *`;
    else if (newMode === "daily") {
      const [hh, mm] = newTime.split(":");
      cron = `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`;
    } else if (newMode === "weekly") {
      cron = `0 0 * * ${newDow}`;
    } else if (newMode === "monthly") {
      cron = `0 0 ${newDom} * *`;
    } else {
      cron = customCron;
    }
    onChange(cron);
  };

  const handleModeChange = (val: string) => {
    const m = val as any;
    setMode(m);
    updateCron(m, interval, time, dayOfWeek, dayOfMonth);
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) || 1;
    setInterval(val);
    updateCron(mode, val, time, dayOfWeek, dayOfMonth);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTime(val);
    updateCron(mode, interval, val, dayOfWeek, dayOfMonth);
  };

  const handleDowChange = (val: string) => {
    setDayOfWeek(val);
    updateCron(mode, interval, time, val, dayOfMonth);
  };

  const handleDomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) || 1;
    setDayOfMonth(val);
    updateCron(mode, interval, time, dayOfWeek, val);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomCron(val);
    onChange(val);
  };

  return (
    <div className="flex gap-2">
      <Select value={mode} onValueChange={handleModeChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Minutes</SelectItem>
          <SelectItem value="hours">Hours</SelectItem>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="weekly">Day of week</SelectItem>
          <SelectItem value="monthly">Day of month</SelectItem>
          <SelectItem value="custom">Custom (Cron)</SelectItem>
        </SelectContent>
      </Select>

      {mode === "minutes" && (
        <Input type="number" min="1" max="59" value={interval} onChange={handleIntervalChange} className="w-full" />
      )}

      {mode === "hours" && (
        <Input type="number" min="1" max="23" value={interval} onChange={handleIntervalChange} className="w-full" />
      )}

      {mode === "daily" && (
        <Input type="time" value={time} onChange={handleTimeChange} className="w-full" />
      )}

      {mode === "weekly" && (
        <Select value={dayOfWeek} onValueChange={handleDowChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Monday</SelectItem>
            <SelectItem value="2">Tuesday</SelectItem>
            <SelectItem value="3">Wednesday</SelectItem>
            <SelectItem value="4">Thursday</SelectItem>
            <SelectItem value="5">Friday</SelectItem>
            <SelectItem value="6">Saturday</SelectItem>
            <SelectItem value="0">Sunday</SelectItem>
          </SelectContent>
        </Select>
      )}

      {mode === "monthly" && (
        <Input type="number" min="1" max="31" value={dayOfMonth} onChange={handleDomChange} className="w-full" />
      )}

      {mode === "custom" && (
        <Input value={customCron} onChange={handleCustomChange} className="w-full font-mono" placeholder="* * * * *" />
      )}
    </div>
  );
}
