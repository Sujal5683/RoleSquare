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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, FileCode2, Plus } from "lucide-react";

interface AssignSchemaDialogProps {
  dataset: DatasetDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignSchemaDialog({ dataset, open, onOpenChange }: AssignSchemaDialogProps) {
  const queryClient = useQueryClient();
  const openSchema = useAppStore((s) => s.openSchema);
  const orgId = useAppStore((s) => s.selectedOrganizationId);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>("");
  const [newSchemaName, setNewSchemaName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"existing" | "new">("existing");

  const { data: schemas, isLoading } = useQuery({
    queryKey: ["schemas", orgId],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
    enabled: open && !!orgId,
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

  const createAndAssignMutation = useMutation({
    mutationFn: async (name: string) => {
      const newSchema = await api.post<SchemaDTO>("/api/schemas", { name });
      await api.patch<DatasetDTO>(`/api/datasets/${dataset?.id}`, { schemaId: newSchema.id });
      return newSchema;
    },
    onSuccess: (newSchema) => {
      toast.success(`Schema "${newSchema.name}" created and assigned`);
      queryClient.invalidateQueries({ queryKey: ["dataset", dataset?.id] });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      onOpenChange(false);
      setNewSchemaName("");
      openSchema(newSchema.id, newSchema.name);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create schema";
      toast.error("Creation failed", { description: msg });
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "existing" | "new")} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Select Existing</TabsTrigger>
            <TabsTrigger value="new">Create New</TabsTrigger>
          </TabsList>
          
          <div className="py-4">
            {hasExistingSchema && (
              <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
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

            <TabsContent value="existing" className="m-0 space-y-2">
              <Select
                value={selectedSchemaId}
                onValueChange={setSelectedSchemaId}
                disabled={isLoading || assignMutation.isPending || createAndAssignMutation.isPending}
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
            </TabsContent>

            <TabsContent value="new" className="m-0 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="schema-name">New Schema Name</Label>
                <Input 
                  id="schema-name"
                  placeholder="e.g. User Profiles"
                  value={newSchemaName}
                  onChange={(e) => setNewSchemaName(e.target.value)}
                  disabled={createAndAssignMutation.isPending || assignMutation.isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This will create a new blank schema, link it to {dataset.name}, and take you to the Schema Builder to add fields.
              </p>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {activeTab === "existing" ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!selectedSchemaId || assignMutation.isPending}
              onClick={() => assignMutation.mutate(selectedSchemaId)}
            >
              {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {hasExistingSchema ? "Change Schema" : "Assign Schema"}
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!newSchemaName.trim() || createAndAssignMutation.isPending}
              onClick={() => createAndAssignMutation.mutate(newSchemaName.trim())}
            >
              {createAndAssignMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create & Assign
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
