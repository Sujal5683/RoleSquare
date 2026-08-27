import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperProps {
  steps: string[];
  currentStep: number; // 0-indexed
  onChangeStep?: (stepIndex: number) => void;
  className?: string;
}

export function Stepper({ steps, currentStep, onChangeStep, className }: StepperProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      {steps.map((label, i) => {
        const isActive = currentStep === i;
        const isDone = currentStep > i;
        const isClickable = !!onChangeStep && (isDone || isActive);

        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => isClickable && onChangeStep(i)}
              disabled={!isClickable}
              className={cn(
                "flex h-7 items-center rounded-full px-3.5 text-xs font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20 ring-offset-1 ring-offset-background"
                  : isDone
                  ? "bg-primary/15 text-primary hover:bg-primary/25 cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-default opacity-80",
                isClickable && !isActive && "hover:opacity-100"
              )}
            >
              <span className="mr-1.5 flex items-center justify-center">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className={cn("font-bold text-[10px]", isActive ? "text-primary-foreground/90" : "text-muted-foreground")}>
                    {i + 1}.
                  </span>
                )}
              </span>
              {label}
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-4 sm:w-6 transition-colors duration-300",
                  isDone ? "bg-primary/40" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
