"use client";

import { useEffect, useState } from "react";
import { Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { useProjectsStore } from "@/lib/store/projects";

export function ProjectGrid() {
  const { projects, isLoading, loadProjects } = useProjectsStore();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header - breadcrumbs + count + button (left-aligned) */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4 px-4 py-3">
          <span className="text-foreground font-medium">Проекты</span>
          {!isLoading && (
            <span className="text-muted-foreground">
              · {projects.length} {projectsLabel(projects.length)}
            </span>
          )}
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Создать проект
          </Button>
        </div>
      </div>

      {/* Grid - full width, no max-width */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-[1600px] mx-auto">
          {isLoading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="rounded-md overflow-hidden border border-border bg-card">
      <Skeleton className="aspect-video w-full" />
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
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
