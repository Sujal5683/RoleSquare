"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/ui/image-cropper";
import { Pencil } from "lucide-react";

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return name.substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface ProfileAvatarProps {
  user: {
    name?: string | null;
    email: string;
    avatarUrl?: string | null;
  };
}

export function ProfileAvatar({ user }: ProfileAvatarProps) {
  const queryClient = useQueryClient();
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateAvatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => api.patch("/api/session", { avatarUrl }),
    onSuccess: () => {
      toast.success("Profile picture updated");
      queryClient.invalidateQueries({ queryKey: ["session"] });
      setCropImageSrc(null);
    },
    onError: () => toast.error("Failed to update profile picture"),
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size should be less than 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setCropImageSrc(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <div 
        className="relative group cursor-pointer" 
        onClick={() => fileInputRef.current?.click()}
      >
        <Avatar className="h-16 w-16 transition-opacity group-hover:opacity-80">
          {user.avatarUrl && (
            <AvatarImage src={user.avatarUrl} alt={user.name ?? "User"} />
          )}
          <AvatarFallback className="text-lg font-medium">
            {initials(user.name ?? user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil className="h-5 w-5 text-white" />
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleAvatarChange} 
        />
      </div>

      <ImageCropper
        imageSrc={cropImageSrc}
        onClose={() => setCropImageSrc(null)}
        onSave={(base64) => updateAvatarMutation.mutate(base64)}
        isSaving={updateAvatarMutation.isPending}
        title="Crop Profile Picture"
        description="Adjust the square crop for your profile picture."
      />
    </>
  );
}
