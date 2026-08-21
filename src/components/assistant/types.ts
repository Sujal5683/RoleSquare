export interface QuickChip {
  label: string;
  value: string;
  variant: "default" | "destructive" | "outline";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolResult?: unknown;
  modelUsed?: string;
  isStreaming?: boolean;
  timestamp: number;
  chips?: QuickChip[];
}
