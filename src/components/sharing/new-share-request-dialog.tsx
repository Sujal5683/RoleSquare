"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Building2, User, Lock, Eye, Edit3, MessageSquare,
  Loader2, X, ChevronDown, Share2,
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

  // Debounced search across users + orgs
  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const [usersRes, orgsRes] = await Promise.allSettled([
        api.get<{ data: Array<{ id: string; email: string; name: string | null; avatarUrl: string | null }> }>(
          `/api/users/search?q=${encodeURIComponent(q)}&limit=5`
        ),
        api.get<Array<{ id: string; name: string; slug: string }>>(
          `/api/organizations?q=${encodeURIComponent(q)}&limit=5`
        ),
      ]);

      const users: SearchResult[] =
        usersRes.status === "fulfilled"
          ? (usersRes.value?.data ?? []).map((u) => ({
              type: "user" as const,
              id: u.id,
              name: u.name ?? u.email.split("@")[0],
              email: u.email,
            }))
          : [];

      const orgs: SearchResult[] =
        orgsRes.status === "fulfilled"
          ? (Array.isArray(orgsRes.value) ? orgsRes.value : [])
              .filter((o) => o.id !== activeOrgId) // exclude self
              .map((o) => ({
                type: "org" as const,
                id: o.id,
                name: o.name,
                slug: o.slug,
              }))
          : [];

      // If query contains @, show users first; otherwise orgs first
      const ordered = q.includes("@")
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
      debounceRef.current = setTimeout(() => performSearch(query), 300);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, target, performSearch]);

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
      if (!dataset || !target || !activeOrgId) throw new Error("Missing required fields");
      return api.post("/api/sharing/cross-org", {
        datasetId: dataset.id,
        shareType: "grant",
        direction: "outgoing",
        ...(target.type === "user"
          ? { targetEmail: target.email }
          : { targetOrganizationId: target.id }),
        level: accessLevel,
        reason: reason.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(`Access granted to ${target?.name}`);
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] });
      handleClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to share dataset";
      toast.error("Share failed", { description: msg });
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

  function handleClose() {
    setQuery("");
    setResults([]);
    setTarget(null);
    setAccessLevel("read");
    setReason("");
    setShowDropdown(false);
    onOpenChange(false);
  }

  const selectedLevel = ACCESS_LEVELS.find((l) => l.value === accessLevel) ?? ACCESS_LEVELS[0];
  const canShare = !!target && !!dataset && !shareMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share{dataset ? `: ${dataset.name}` : " Dataset"}
          </DialogTitle>
          <DialogDescription>
            Share this dataset with a specific user or an entire organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Search / Target selector */}
          <div className="space-y-2">
            <Label htmlFor="share-search">Share with</Label>
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
                    placeholder="Search by email, name, or organization…"
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
                  className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-lg overflow-hidden"
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
                  No users or organizations found for &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Type an email address to share with a specific person, or an organization name.
            </p>
          </div>

          {/* Access level */}
          <div className="space-y-2">
            <Label>Access level</Label>
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
                {ACCESS_LEVELS.map((level) => (
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

          {/* Optional note */}
          <div className="space-y-2">
            <Label htmlFor="share-reason" className="flex items-center gap-1">
              Note
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <Textarea
              id="share-reason"
              placeholder="Add a message about this share…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => shareMutation.mutate()}
            disabled={!canShare}
          >
            {shareMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sharing…</>
            ) : (
              <><Share2 className="mr-2 h-4 w-4" />Share</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
