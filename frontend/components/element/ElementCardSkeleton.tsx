import { cn } from "@/lib/utils";

export interface ElementCardSkeletonProps {
  className?: string;
}

export function ElementCardSkeleton({ className }: ElementCardSkeletonProps) {
  return (
    <div
      className={cn(
        "aspect-square rounded-md animate-pulse bg-muted",
        className
      )}
    />
  );
}
