import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";

export function AiStudioSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Stepper
        className="mb-6"
        steps={["Source", "Schema", "Configure", "Review"]}
        currentStep={0}
        onChangeStep={() => {}}
      />

      <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        <CardHeader>
          <Skeleton className="h-6 w-1/4 mb-1" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-md border p-2.5 flex items-center gap-2.5">
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t pt-4">
          <Skeleton className="h-9 w-24 rounded-md" />
        </CardFooter>
      </Card>
    </div>
  );
}
