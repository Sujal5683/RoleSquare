import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCompactNumber(n: number): string {
  if (n === -1) return "Unlimited";
  if (n >= 1000000) {
    return `${parseFloat((n / 1000000).toFixed(1))}M`;
  }
  return n.toLocaleString();
}
