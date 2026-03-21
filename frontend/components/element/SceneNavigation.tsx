"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Scene } from "@/lib/types";

export interface SceneNavigationProps {
  previousScene: Scene | null;
  nextScene: Scene | null;
  currentScene: Scene | null;
  currentIndex: number;
  total: number;
  onNavigate: (sceneId: number) => void;
  className?: string;
}

const MAX_NAME_LENGTH = 40;

function truncateName(name: string): string {
  if (name.length <= MAX_NAME_LENGTH) return name;
  return name.slice(0, MAX_NAME_LENGTH) + "…";
}

export function SceneNavigation({
  previousScene,
  nextScene,
  currentScene,
  currentIndex,
  total,
  onNavigate,
  className,
}: SceneNavigationProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 text-sm",
        className
      )}
    >
      {/* Previous scene */}
      {previousScene ? (
        <button
          onClick={() => onNavigate(previousScene.id)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          title={previousScene.name}
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Группа «{truncateName(previousScene.name)}»</span>
        </button>
      ) : (
        <div className="w-4" />
      )}

      {/* Current scene */}
      <span className="font-medium text-foreground">
        Группа «{currentScene ? truncateName(currentScene.name) : "…"}»
      </span>

      {/* Next scene */}
      {nextScene ? (
        <button
          onClick={() => onNavigate(nextScene.id)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          title={nextScene.name}
        >
          <span>Группа «{truncateName(nextScene.name)}»</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-4" />
      )}
    </div>
  );
}
