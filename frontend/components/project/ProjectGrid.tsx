"use client";

import { useEffect, useState } from "react";
import { Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ShareLinksPanel } from "@/components/sharing/ShareLinksPanel";
import { useProjectsStore } from "@/lib/store/projects";

export function ProjectGrid() {
  const { projects, isLoading, loadProjects } = useProjectsStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [linksPanelOpen, setLinksPanelOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header - breadcrumbs + create button */}
      <div className="flex items-center border-b px-4 py-2 bg-surface shrink-0">
        <span className="text-sm text-foreground font-medium">Проекты</span>
        {!isLoading && (
          <span className="text-sm text-muted-foreground ml-2">
            · {projects.length} {projectsLabel(projects.length)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 h-7 px-3 ml-3 rounded text-xs font-medium text-primary bg-card hover:bg-card/80 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Создать проект
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setLinksPanelOpen(true)}
            className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors shrink-0"
          >
            Активные ссылки
          </button>
        </div>
      </div>

      {/* Grid - full width, no max-width */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {isLoading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Global share links panel (slide-over) */}
      {linksPanelOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-background border-l shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-medium">Все ссылки для просмотра</h3>
            <button
              type="button"
              onClick={() => setLinksPanelOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <ShareLinksPanel />
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="aspect-video p-1.5">
        <Skeleton className="w-full h-full rounded-md" />
      </div>
      <div className="p-3 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-6">
        <FolderOpen className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Нет проектов</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Создайте свой первый проект, чтобы начать работу с раскадровками.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4 mr-2" />
        Создать проект
      </Button>
    </div>
  );
}

function projectsLabel(count: number): string {
  if (count === 1) return "проект";
  if (count >= 2 && count <= 4) return "проекта";
  return "проектов";
}
