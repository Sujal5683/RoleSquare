import { Skeleton } from "@/components/ui/skeleton";
import { TableRow, TableCell } from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export function DetailGridSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, r) => (
        <TableRow key={r} className="h-12 hover:bg-transparent">
          <TableCell className="w-[50px] min-w-[50px] max-w-[50px] border-r p-0">
            <div className="flex h-full w-full items-center justify-center">
              <Skeleton className="h-4 w-4 rounded-sm" />
            </div>
          </TableCell>
          <TableCell className="border-r align-middle">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-4" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </TableCell>
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c} className="border-r last:border-r-0 align-middle">
              <Skeleton className="h-4 w-3/4 max-w-[120px] mx-4" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function DetailCardSkeleton() {
  return (
    <>
      {Array.from({ length: 9 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-3 p-4 transition-all shadow-sm">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-sm" />
              <Skeleton className="h-3 w-4" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex-1 space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="grid grid-cols-[100px_1fr] items-center gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-full max-w-[150px]" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
