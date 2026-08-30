import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export function InlineEditCell({
  datasetId,
  recordId,
  fieldId,
  valueId,
  initialValue,
  fieldType,
  onClose,
  onSaveSuccess,
}: {
  datasetId: string;
  recordId: string;
  fieldId: string;
  valueId?: string;
  initialValue: string;
  fieldType: string;
  onClose: () => void;
  onSaveSuccess?: (oldVal: string, newVal: string, valueId: string) => void;
}) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (newValue: string) => {
      // Basic parser for inline edit
      let parsedValue: any = newValue;
      if (fieldType === "number") {
        parsedValue = parseFloat(newValue) || 0;
      } else if (fieldType === "boolean") {
        parsedValue = newValue.toLowerCase() === "true" || newValue.toLowerCase() === "yes" || newValue === "1";
      }

      if (valueId) {
        return api.patch(`/api/datasets/${datasetId}/records/${recordId}/values/${valueId}`, {
          value: parsedValue,
          confidence: 1, // manual override
          evidence: "Manual inline edit",
        });
      } else {
        return api.post(`/api/datasets/${datasetId}/records/${recordId}/values`, {
          fieldId,
          value: parsedValue,
          confidence: 1,
          evidence: "Manual inline edit",
        });
      }
    },
    onMutate: async (newValue: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["dataset-records", datasetId] });

      // Snapshot the previous value
      const previousRecords = queryClient.getQueryData(["dataset-records", datasetId]);

      // Optimistically update to the new value
      queryClient.setQueryData(["dataset-records", datasetId], (old: any) => {
        if (!old || !old.records) return old;
        return {
          ...old,
          records: old.records.map((record: any) => {
            if (record.id === recordId) {
              const newValues = [...(record.values || [])];
              const valIndex = newValues.findIndex((v) => v.fieldId === fieldId);
              if (valIndex >= 0) {
                newValues[valIndex] = { ...newValues[valIndex], value: newValue };
              } else {
                newValues.push({ id: "temp", fieldId, value: newValue, confidence: 1 });
              }
              return { ...record, values: newValues };
            }
            return record;
          }),
        };
      });

      // Instantly close the cell for a snappy UI
      onClose();
      
      // Call save success immediately for undo stack (using temp id if new)
      if (onSaveSuccess) {
        onSaveSuccess(initialValue, newValue, valueId || "temp");
      }

      return { previousRecords };
    },
    onError: (err: any, newValue, context) => {
      queryClient.setQueryData(["dataset-records", datasetId], context?.previousRecords);
      toast.error(err.message || "Failed to save");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
    },
  });

  const handleSave = () => {
    if (val === initialValue) {
      onClose();
      return;
    }
    updateMutation.mutate(val);
  };

  return (
    <Input
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") onClose();
      }}
      disabled={updateMutation.isPending}
      className="h-8 py-1 px-2 text-sm w-full bg-background"
    />
  );
}
