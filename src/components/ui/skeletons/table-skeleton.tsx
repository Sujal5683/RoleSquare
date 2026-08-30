import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton() {
  return (
    <div className="rounded-md border">
      {/* Table Header */}
      <div className="border-b bg-muted/20 px-4 py-3 flex items-center gap-4">
        <Skeleton className="h-4 w-8 shrink-0" /> {/* Checkbox */}
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24 hidden md:block" />
        <Skeleton className="h-4 w-20 hidden md:block ml-auto" />
      </div>

      {/* Table Rows */}
      <div className="divide-y">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-8 shrink-0" /> {/* Checkbox */}
            
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Skeleton className="h-8 w-8 rounded-full shrink-0 hidden sm:block" /> {/* Avatar/Icon */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24 hidden sm:block" />
              </div>
            </div>

            <Skeleton className="h-5 w-20 hidden md:block shrink-0 rounded-full" /> {/* Badge */}
            <Skeleton className="h-4 w-24 hidden md:block shrink-0 ml-4" /> {/* Date */}
            <Skeleton className="h-8 w-8 rounded-md shrink-0 ml-2" /> {/* Action button */}
          </div>
        ))}
      </div>
    </div>
  );
}
