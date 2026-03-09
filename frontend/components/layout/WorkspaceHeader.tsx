"use client";

import { useRouter } from "next/navigation";
import { useMemo, useEffect } from "react";
import { Breadcrumbs } from "./Breadcrumbs";
import { SceneNavigation } from "@/components/element/SceneNavigation";
import { useSceneNeighbors } from "@/lib/hooks/use-scene-neighbors";
import { useProjectsStore } from "@/lib/store/projects";

interface WorkspaceHeaderProps {
  projectId: number;
  sceneId: number;
}

function pluralizeScenes(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "сцен";
  if (lastDigit === 1) return "сцена";
  if (lastDigit >= 2 && lastTwoDigits <= 4) return "сцены";
  return "сцен";
}

export function WorkspaceHeader({ projectId, sceneId }: WorkspaceHeaderProps) {
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.loadProjects);

  // Загружаем проекты при монтировании, если их ещё нет
  useEffect(() => {
    if (projects.length === 0) {
      void loadProjects();
    }
  }, [projects.length, loadProjects]);
  
  const {
    previousScene,
    nextScene,
    currentScene,
    currentIndex,
    total,
    isReady,
  } = useSceneNeighbors({ projectId, sceneId, autoLoad: true });

  const handleNavigate = (targetSceneId: number) => {
    router.push(`/projects/${projectId}/scenes/${targetSceneId}`);
  };

  // Используем имя проекта из projects store — стабильно при смене сцен
  const projectName = useMemo(() => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name;
  }, [projects, projectId]);

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Breadcrumbs - только проект, сцена показывается в навигации по центру */}
        <div className="flex-1 min-w-0">
          <Breadcrumbs 
            projectName={projectName} 
            sceneName={undefined}
            suffix={`· ${total} ${pluralizeScenes(total)}`}
          />
        </div>
        
        {/* Center: Scene navigation */}
        {isReady && (
          <div className="flex-1 flex justify-center">
            <SceneNavigation
              previousScene={previousScene}
              nextScene={nextScene}
              currentScene={currentScene}
              currentIndex={currentIndex}
              total={total}
              onNavigate={handleNavigate}
            />
          </div>
        )}
        
        {/* Right: spacer for balance */}
        <div className="flex-1" />
      </div>
    </div>
  );
}
