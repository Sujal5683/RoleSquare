import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function UsageSkeleton() {
  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
              <Skeleton className="mt-4 h-8 w-24" />
              <div className="mt-4 flex items-center gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quotas progress bars */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
          <div className="flex justify-end items-center gap-3 pt-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </CardContent>
      </Card>

      {/* Daily token consumption chart */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="ml-auto h-3 w-20" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  );
}
