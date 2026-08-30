import { Skeleton } from "@/components/ui/skeleton";

export function AuditSkeleton() {
  return (
    <div className="relative max-h-[40rem] overflow-y-auto pr-2">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
      <ol className="space-y-4 pt-2 pb-4">
        {[...Array(5)].map((_, i) => (
          <li key={i} className="relative pl-12">
            {/* Dot */}
            <div className="absolute left-[12px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background bg-muted">
              <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            </div>
            
            <div className="rounded-lg border p-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                {/* Actor and Action */}
                <div className="flex items-center gap-2 sm:w-[220px] md:w-[260px] shrink-0">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3.5 w-10 rounded-sm" />
                      <Skeleton className="h-3.5 w-12 rounded-sm" />
                    </div>
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>

                {/* Entity and Reason */}
                <div className="flex-1 flex flex-col justify-center min-w-0 border-l-0 sm:border-l pl-0 sm:pl-4 border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-12 rounded-sm shrink-0" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                </div>

                {/* Action Button */}
                <div className="shrink-0 mt-1 sm:mt-0">
                  <Skeleton className="h-6 w-16 rounded" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
