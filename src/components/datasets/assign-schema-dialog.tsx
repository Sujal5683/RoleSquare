"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { DatasetDTO, SchemaDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2, FileCode2 } from "lucide-react";

interface AssignSchemaDialogProps {
  dataset: DatasetDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignSchemaDialog({ dataset, open, onOpenChange }: AssignSchemaDialogProps) {
  const queryClient = useQueryClient();
  const setView = useAppStore((s) => s.setView);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>("");

  const { data: schemas, isLoading } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: (schemaId: string) =>
      api.patch<DatasetDTO>(`/api/datasets/${dataset?.id}`, { schemaId }),
    onSuccess: () => {
      toast.success("Schema assigned successfully");
      queryClient.invalidateQueries({ queryKey: ["dataset", dataset?.id] });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      onOpenChange(false);
      setSelectedSchemaId("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to assign schema";
      toast.error("Assignment failed", { description: msg });
    },
  });

  if (!dataset) return null;

  const hasExistingSchema = !!dataset.schemaId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Schema</DialogTitle>
          <DialogDescription>
            Choose a schema to enforce data validation and field types for this dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {hasExistingSchema && (
            <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Warning: Replacing Schema</p>
                <p className="mt-1">
                  This dataset currently uses the <strong>{dataset.schema?.name}</strong> schema. 
                  Changing the schema may cause existing data to fail validation or lose field mappings.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Select
              value={selectedSchemaId}
              onValueChange={setSelectedSchemaId}
              disabled={isLoading || assignMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading schemas..." : "Select a schema..."} />
              </SelectTrigger>
              <SelectContent>
                {schemas?.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No schemas found
                  </SelectItem>
                ) : (
                  schemas?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.fields?.length || 0} fields)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              onOpenChange(false);
              setView("schema-builder");
            }}
          >
            <FileCode2 className="mr-2 h-4 w-4" />
            Create New Schema
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!selectedSchemaId || assignMutation.isPending}
            onClick={() => assignMutation.mutate(selectedSchemaId)}
          >
            {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasExistingSchema ? "Change Schema" : "Assign Schema"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
