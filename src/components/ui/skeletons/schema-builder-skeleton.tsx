import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SchemaBuilderSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Schema details + fields */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base"><Skeleton className="h-5 w-32" /></CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base"><Skeleton className="h-5 w-32" /></CardTitle>
            <Skeleton className="h-9 w-28 rounded-md" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/20 border-y text-xs font-medium text-muted-foreground">
              <div className="col-span-3"><Skeleton className="h-4 w-16" /></div>
              <div className="col-span-3"><Skeleton className="h-4 w-12" /></div>
              <div className="col-span-4"><Skeleton className="h-4 w-24" /></div>
              <div className="col-span-2 text-center"><Skeleton className="h-4 w-16 mx-auto" /></div>
            </div>
            <div className="divide-y">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 p-3">
                  <Skeleton className="h-8 w-4 shrink-0" /> {/* Drag handle */}
                  <div className="grid grid-cols-12 gap-4 w-full items-center">
                    <div className="col-span-3"><Skeleton className="h-4 w-24" /></div>
                    <div className="col-span-3"><Skeleton className="h-5 w-20 rounded-full" /></div>
                    <div className="col-span-4"><Skeleton className="h-4 w-40" /></div>
                    <div className="col-span-2 flex items-center justify-center gap-4">
                      <Skeleton className="h-5 w-8 rounded-full" /> {/* Switch */}
                      <Skeleton className="h-8 w-8 rounded-md shrink-0" /> {/* Action */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: prompt preview + test extraction */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-5 w-32" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full rounded-md" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-5 w-32" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-[136px] w-full rounded-md" />
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
