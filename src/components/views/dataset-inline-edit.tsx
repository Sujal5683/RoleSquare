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
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
      toast.success("Saved");
      if (onSaveSuccess) {
        // If it was a POST, valueId was undefined, but we get the new value's ID from the response.
        const savedValueId = valueId || res?.id;
        onSaveSuccess(initialValue, val, savedValueId);
      }
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
      onClose();
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
