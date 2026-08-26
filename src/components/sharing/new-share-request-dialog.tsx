"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Building2, User, Eye, Edit3, MessageSquare,
  Loader2, X, Share2, Download, Database, Users
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { DatasetDTO } from "@/lib/types";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface SearchResult {
  type: "user" | "org";
  id: string;
  name: string;
  email?: string;
  slug?: string;
  avatarUrl?: string | null;
}

interface ShareTarget {
  type: "user" | "org";
  id: string;
  name: string;
  email?: string;
  slug?: string;
}

const ACCESS_LEVELS = [
  { value: "read", label: "Viewer", description: "Can view data only", icon: Eye },
  { value: "comment", label: "Commenter", description: "Can view and comment", icon: MessageSquare },
  { value: "edit", label: "Editor", description: "Can view, comment, and edit", icon: Edit3 },
] as const;

interface NewShareRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset?: DatasetDTO | null;
}

export function NewShareRequestDialog({
  open,
  onOpenChange,
  dataset,
}: NewShareRequestDialogProps) {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();

  const [actionType, setActionType] = useState<"share" | "request">("share");
  const [targetType, setTargetType] = useState<"any" | "user" | "org">("any");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const [accessLevel, setAccessLevel] = useState<"read" | "comment" | "edit">("read");
  const [reason, setReason] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Initialize selected dataset when opened with a prop
  useEffect(() => {
    if (open && dataset) {
      setSelectedDatasetId(dataset.id);
      setActionType("share");
    } else if (!open) {
      // Reset state on close
      setQuery("");
      setResults([]);
      setTarget(null);
      setAccessLevel("read");
      setReason("");
      setShowDropdown(false);
      setSelectedDatasetId("");
      setActionType("share");
      setTargetType("any");
    }
  }, [open, dataset]);

  // Fetch datasets for the dropdown if none is pre-selected
  const { data: datasets } = useQuery({
    queryKey: ["datasets", activeOrgId],
    queryFn: () => api.get<DatasetDTO[]>(`/api/datasets?organizationId=${activeOrgId}`),
    enabled: open && !dataset && !!activeOrgId,
  });

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<{ organizations: Array<{ id: string; role: string }> }>("/api/session"),
  });
  const myRole = session?.organizations?.find((o) => o.id === activeOrgId)?.role;
  const isOwnerOrAdmin = myRole === "owner" || myRole === "admin";

  const myDatasets = (datasets ?? []).filter(d => !d.isShared);

  // Debounced search across users + orgs
  const performSearch = useCallback(async (q: string, typeFilter: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const promises: Promise<{ type: string; data: any }>[] = [];
      
      if (typeFilter === "any" || typeFilter === "user") {
        promises.push(
          api.get<{ data: Array<{ id: string; email: string; name: string | null; avatarUrl: string | null }> }>(
            `/api/users/search?q=${encodeURIComponent(q)}&limit=5`
          ).then(res => ({ type: 'users', data: res }))
        );
      }
      
      if (typeFilter === "any" || typeFilter === "org") {
        promises.push(
          api.get<Array<{ id: string; name: string; slug: string }>>(
            `/api/organizations?q=${encodeURIComponent(q)}&limit=5`
          ).then(res => ({ type: 'orgs', data: res }))
        );
      }

      const settled = await Promise.allSettled(promises);
      
      let users: SearchResult[] = [];
      let orgs: SearchResult[] = [];

      settled.forEach(res => {
        if (res.status === 'fulfilled') {
          if (res.value.type === 'users') {
            const usersRes = res.value.data as { data: Array<{ id: string; email: string; name: string | null }> };
            users = (usersRes?.data ?? []).map((u) => ({
              type: "user" as const,
              id: u.id,
              name: u.name ?? u.email.split("@")[0],
              email: u.email,
            }));
          } else if (res.value.type === 'orgs') {
            const orgsRes = res.value.data as Array<{ id: string; name: string; slug: string }>;
            orgs = (Array.isArray(orgsRes) ? orgsRes : [])
              .filter((o) => o.id !== activeOrgId) // exclude self
              .map((o) => ({
                type: "org" as const,
                id: o.id,
                name: o.name,
                slug: o.slug,
              }));
          }
        }
      });

      // If query contains @ or filtering by users, show users first
      const ordered = (q.includes("@") || typeFilter === "user")
        ? [...users, ...orgs]
        : [...orgs, ...users];

      setResults(ordered);
      setShowDropdown(ordered.length > 0);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!target) {
      debounceRef.current = setTimeout(() => performSearch(query, targetType), 300);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, target, targetType, performSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const shareMutation = useMutation({
    mutationFn: () => {
      if (!target || !activeOrgId) throw new Error("Missing target organization/user");
      
      const isGrant = actionType === "share";
      if (isGrant && !selectedDatasetId) {
        throw new Error("Please select a dataset to share");
      }

      return api.post("/api/sharing/cross-org", {
        datasetId: selectedDatasetId || undefined,
        shareType: isGrant ? "grant" : "request",
        direction: "outgoing",
        ...(target.type === "user"
          ? { targetEmail: target.email }
          : { targetOrganizationId: target.id }),
        level: accessLevel,
        reason: reason.trim() || null,
      });
    },
    onSuccess: () => {
      if (actionType === "share") {
        toast.success(`Access granted to ${target?.name}`);
      } else {
        toast.success(`Data request sent to ${target?.name}`);
      }
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to perform action";
      toast.error("Action failed", { description: msg });
    },
  });

  function selectTarget(result: SearchResult) {
    setTarget({
      type: result.type,
      id: result.id,
      name: result.name,
      email: result.email,
      slug: result.slug,
    });
    setQuery("");
    setShowDropdown(false);
    setResults([]);
  }

  function clearTarget() {
    setTarget(null);
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  const selectedLevel = ACCESS_LEVELS.find((l) => l.value === accessLevel) ?? ACCESS_LEVELS[0];
  const canSubmit = !!target && !shareMutation.isPending && (actionType === "request" || !!selectedDatasetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            {dataset ? `Share: ${dataset.name}` : "Data Sharing & Requests"}
          </DialogTitle>
          <DialogDescription>
            {dataset ? "Share this dataset with a specific user or an entire organization." : "Share your datasets or request access to data from others."}
          </DialogDescription>
        </DialogHeader>

        {!dataset && (
          <Tabs value={actionType} onValueChange={(v) => setActionType(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="share">
                <Share2 className="mr-2 h-4 w-4" /> Share Dataset
              </TabsTrigger>
              <TabsTrigger value="request">
                <Download className="mr-2 h-4 w-4" /> Request Data
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="space-y-4 py-2">
          {/* Dataset selector (only for sharing when no dataset passed) */}
          {actionType === "share" && !dataset && (
            <div className="space-y-2">
              <Label>Select Dataset</Label>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a dataset to share..." />
                </SelectTrigger>
                <SelectContent>
                  {myDatasets.length === 0 ? (
                    <SelectItem value="none" disabled>No datasets available</SelectItem>
                  ) : (
                    myDatasets.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          {d.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Target Type selector */}
          <div className="space-y-2">
            <Label>Who are you {actionType === "share" ? "sharing with" : "requesting from"}?</Label>
            <RadioGroup 
              value={targetType} 
              onValueChange={(v) => {
                setTargetType(v as any);
                setTarget(null);
                setQuery("");
              }}
              className="flex items-center gap-4 mt-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="any" id="target-any" />
                <Label htmlFor="target-any" className="font-normal cursor-pointer">Anyone</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="user" id="target-user" />
                <Label htmlFor="target-user" className="font-normal cursor-pointer flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Person
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="org" id="target-org" />
                <Label htmlFor="target-org" className="font-normal cursor-pointer flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" /> Organization
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Search / Target selector */}
          <div className="space-y-2">
            <div className="relative">
              {target ? (
                /* Selected target chip */
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold",
                      target.type === "user" ? "bg-blue-500" : "bg-violet-500"
                    )}
                  >
                    {target.type === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-none truncate">{target.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {target.type === "user" ? target.email : `@${target.slug}`}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize shrink-0">
                    {target.type === "user" ? "Person" : "Organization"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={clearTarget}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                /* Search input */
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="share-search"
                    ref={searchRef}
                    className="pl-9 pr-9"
                    placeholder={`Search for a ${targetType === 'any' ? 'user or organization' : targetType === 'user' ? 'person by email' : 'organization'}…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => results.length > 0 && setShowDropdown(true)}
                    autoComplete="off"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}

              {/* Search results dropdown */}
              {showDropdown && results.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg"
                >
                  {results.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
                      onClick={() => selectTarget(result)}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs",
                          result.type === "user" ? "bg-blue-500" : "bg-violet-500"
                        )}
                      >
                        {result.type === "user" ? (
                          <User className="h-3.5 w-3.5" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{result.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.type === "user" ? result.email : `@${result.slug}`}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize shrink-0">
                        {result.type === "user" ? "Person" : "Org"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && results.length === 0 && !isSearching && query.length >= 2 && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-lg">
                  No {targetType === 'any' ? 'users or organizations' : targetType === 'user' ? 'users' : 'organizations'} found for &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Access level (only makes sense to ask for specific access level) */}
          <div className="space-y-2">
            <Label>Access level {actionType === "request" ? "requested" : ""}</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as any)}>
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <selectedLevel.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedLevel.label}</span>
                    <span className="text-muted-foreground text-xs hidden sm:inline">
                      — {selectedLevel.description}
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.filter((level) => isOwnerOrAdmin || level.value !== "edit").map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <div className="flex items-center gap-2">
                      <level.icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{level.label}</div>
                        <div className="text-xs text-muted-foreground">{level.description}</div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note / Data Description */}
          <div className="space-y-2">
            <Label htmlFor="share-reason" className="flex items-center gap-1">
              {actionType === "request" ? "What data do you need?" : "Note"}
              {actionType === "share" && <span className="text-muted-foreground text-xs font-normal">(optional)</span>}
              {actionType === "request" && <span className="text-destructive text-xs font-normal">*</span>}
            </Label>
            <Textarea
              id="share-reason"
              placeholder={actionType === "request" ? "Describe the datasets or information you are requesting access to..." : "Add a message about this share…"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => shareMutation.mutate()}
            disabled={!canSubmit || (actionType === "request" && !reason.trim())}
          >
            {shareMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{actionType === "share" ? "Sharing…" : "Requesting…"}</>
            ) : actionType === "share" ? (
              <><Share2 className="mr-2 h-4 w-4" />Share</>
            ) : (
              <><Download className="mr-2 h-4 w-4" />Send Request</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
