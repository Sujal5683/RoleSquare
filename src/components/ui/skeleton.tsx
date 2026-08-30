import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md border border-border/40 shimmer",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
