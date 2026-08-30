import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function DatasetsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex p-4 flex-col gap-3">
          <div className="flex flex-col flex-1 min-w-0 gap-3">
            <div className="flex min-w-0 gap-3">
              <Skeleton className="mt-0.5 h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 w-full space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-1/2 rounded-full" />
                  </div>
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3 w-4 shrink-0" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3 w-4 shrink-0" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Skeleton className="h-3 w-4 shrink-0" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full shrink-0" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </Card>
      ))}
    </div>
  );
}
