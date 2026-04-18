import { cn } from "@/lib/utils";
import { ASPECT_RATIO_CLASSES } from "@/lib/utils/constants";
import type { DisplayAspectRatio } from "@/lib/types";

export interface ElementCardSkeletonProps {
  className?: string;
  aspectRatio?: DisplayAspectRatio;
}

export function ElementCardSkeleton({ className, aspectRatio = "landscape" }: ElementCardSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md animate-pulse bg-muted",
        ASPECT_RATIO_CLASSES[aspectRatio],
        className
      )}
    />
  );
}
