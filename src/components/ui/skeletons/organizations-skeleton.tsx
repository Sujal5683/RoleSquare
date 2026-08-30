import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function OrganizationsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex p-4 flex-col gap-3">
          <div className="flex flex-1 min-w-0 gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between">
                <div className="min-w-0 w-full space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <div className="flex items-center gap-2 mt-1">
                    <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                    <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t mt-auto">
            <div className="flex items-center gap-1">
              {[...Array(3)].map((_, j) => (
                <Skeleton key={j} className="h-6 w-6 rounded-full border-2 border-background -ml-2 first:ml-0" />
              ))}
              <Skeleton className="h-3 w-8 ml-2" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </Card>
      ))}
    </div>
  );
}
