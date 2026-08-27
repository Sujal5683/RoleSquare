"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Eye, CheckCircle2, Square } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import type { AiJobDTO, SourceDTO, DatasetDTO } from "@/lib/types";

interface JobListResponse {
  data: AiJobDTO[];
  total: number;
}

export function SidebarJobsWidget() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const setView = useAppStore((s) => s.setView);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  // Fetch recent jobs and filter active ones on the client
  const { data, refetch } = useQuery<JobListResponse>({
    queryKey: ["recent-ai-jobs-widget"],
    queryFn: () => api.get<JobListResponse>(`/api/ai-jobs?pageSize=20`),
    refetchInterval: 2500,
  });

  const { data: sources } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.get<SourceDTO[]>("/api/sources"),
  });

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api.get<DatasetDTO[]>("/api/datasets"),
  });

  const activeJobs = data?.data?.filter((j) => j.status === "running" || j.status === "queued") || [];

  // Ensure index is within bounds if jobs complete
  const index = Math.min(currentIndex, Math.max(0, activeJobs.length - 1));
  const currentJob = activeJobs[index];

  const handleStop = async (jobId: string) => {
    try {
      await api.post(`/api/ai-jobs/${jobId}/cancel`);
      toast.success("Job cancelled");
      refetch();
    } catch (err: any) {
      toast.error("Failed to cancel job", { description: err.message });
    }
  };

  const handleView = (job: AiJobDTO) => {
    if (job.type === "GMAIL_SCAN") {
      setView("sources");
    } else {
      setView("ai-studio");
    }
    setSidebarOpen(false);
  };

  const getJobName = (job: AiJobDTO) => {
    try {
      const payload = job.payload as any;
      if (job.type === "GMAIL_SCAN" || job.type === "NOTION_SCAN" || job.type === "GDRIVE_SCAN") {
        const source = sources?.find((s) => s.id === payload?.sourceId);
        return source?.name || "Source Scan";
      }
      if (job.type === "AI_EXTRACTION") {
        const targetDs = datasets?.find(d => d.id === payload?.targetDatasetId);
        const sourceDs = datasets?.find(d => d.id === payload?.sourceDatasetId);
        const tName = payload?.targetDatasetName || targetDs?.name || "New Dataset";
        return sourceDs?.name ? `${sourceDs.name} → ${tName}` : "AI Extraction";
      }
    } catch {}
    return job.type === "GMAIL_SCAN" ? "Source Scan" : "AI Extraction";
  };

  return (
    <AnimatePresence>
      {activeJobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 30, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: 30, height: 0 }}
          className="flex flex-col mt-auto shrink-0 pb-2 overflow-hidden"
        >
          <Separator className="mb-3 mx-4 w-auto bg-sidebar-border" />
          
          <div className="px-3">
            <div className="relative flex flex-col p-3 border rounded-lg border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground shadow-sm">
              
              {/* Pagination Controls */}
              {activeJobs.length > 1 && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 rounded hover:bg-sidebar-accent"
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={index === 0}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-[9px] font-medium opacity-70">
                    {index + 1}/{activeJobs.length}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 rounded hover:bg-sidebar-accent"
                    onClick={() => setCurrentIndex((prev) => Math.min(activeJobs.length - 1, prev + 1))}
                    disabled={index === activeJobs.length - 1}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2 mb-2 pr-12">
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-semibold truncate" title={getJobName(currentJob)}>
                    {getJobName(currentJob)}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between items-center text-[10px] opacity-70">
                  <span className="capitalize">{currentJob.status}</span>
                  <span>{currentJob.progress}%</span>
                </div>
                <div className="w-full bg-sidebar-border rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${currentJob.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 w-full">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="h-7 text-[10px] flex-1 gap-1.5 bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground"
                  onClick={() => handleView(currentJob)}
                >
                  <Eye className="h-3 w-3" /> View
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="h-7 text-[10px] flex-1 gap-1.5 opacity-90 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStop(currentJob.id);
                  }}
                >
                  <Square className="h-3 w-3 fill-current" /> Stop
                </Button>
              </div>

            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
