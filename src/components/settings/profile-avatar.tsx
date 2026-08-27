"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

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
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateAvatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => api.patch("/api/session", { avatarUrl }),
    onSuccess: () => {
      toast.success("Profile picture updated");
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: () => toast.error("Failed to update profile picture"),
  });

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop(
        { unit: "%", width: 90 },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(initialCrop);
  };

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

  const handleCropSave = () => {
    if (!imgRef.current || !cropImageSrc || !completedCrop) return;
    const image = imgRef.current;
    
    const canvas = document.createElement("canvas");
    const TARGET_SIZE = 150;
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    const sx = completedCrop.x * scaleX;
    const sy = completedCrop.y * scaleY;
    const sWidth = completedCrop.width * scaleX;
    const sHeight = completedCrop.height * scaleY;

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, TARGET_SIZE, TARGET_SIZE);
    
    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
    updateAvatarMutation.mutate(compressedBase64);
    setCropImageSrc(null);
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

      <Dialog open={!!cropImageSrc} onOpenChange={(open) => !open && setCropImageSrc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Profile Picture</DialogTitle>
            <DialogDescription>
              Adjust the square crop for your profile picture.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center items-center py-4 max-h-[60vh] overflow-auto">
            {cropImageSrc && (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
              >
                <img 
                  ref={imgRef}
                  src={cropImageSrc} 
                  alt="Crop preview" 
                  onLoad={onImageLoad}
                  className="max-w-full max-h-[50vh] object-contain"
                />
              </ReactCrop>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropImageSrc(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCropSave} 
              disabled={updateAvatarMutation.isPending}
            >
              {updateAvatarMutation.isPending ? "Saving..." : "Save Picture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
