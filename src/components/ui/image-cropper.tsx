import { useState, useRef } from "react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImageCropperProps {
  imageSrc: string | null;
  onClose: () => void;
  onSave: (croppedImageBase64: string) => void;
  isSaving?: boolean;
  title?: string;
  description?: string;
}

export function ImageCropper({
  imageSrc,
  onClose,
  onSave,
  isSaving = false,
  title = "Crop Image",
  description = "Adjust the square crop.",
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const handleCropSave = () => {
    if (!imgRef.current || !imageSrc || !completedCrop) return;
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
    onSave(compressedBase64);
  };

  return (
    <Dialog open={!!imageSrc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center items-center py-4 max-h-[60vh] overflow-auto">
          {imageSrc && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop preview"
                onLoad={onImageLoad}
                className="max-w-full max-h-[50vh]"
              />
            </ReactCrop>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleCropSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Picture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
