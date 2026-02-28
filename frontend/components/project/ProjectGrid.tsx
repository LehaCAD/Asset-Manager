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
    <div className="px-4 py-8 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Мои проекты</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading
              ? "Загрузка..."
              : projects.length === 0
              ? "Создайте первый проект"
              : `${projects.length} ${projectsLabel(projects.length)}`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Создать проект
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card">
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
