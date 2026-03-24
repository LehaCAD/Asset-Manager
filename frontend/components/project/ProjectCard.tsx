"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Film, Layers, HardDrive, ImageIcon, FolderOpen } from "lucide-react";
import { ChargeIcon } from "@/components/ui/charge-icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { useProjectsStore } from "@/lib/store/projects";
import { PROJECT_STATUSES } from "@/lib/utils/constants";
import { formatStorage, formatCurrency } from "@/lib/utils/format";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
}

const STATUS_BADGE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  PAUSED: "secondary",
  COMPLETED: "outline",
};


export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const statusConfig = PROJECT_STATUSES.find((s) => s.value === project.status);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success("Проект удалён");
      setDeleteOpen(false);
    } catch {
      toast.error("Не удалось удалить проект");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-navigate]")) return;
    router.push(`/projects/${project.id}`);
  }

  function blockCardNavigation(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group relative bg-card border border-border rounded-md overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-150"
      >
        {/* Thumbnail area */}
        <div className="aspect-video bg-muted relative overflow-hidden">
          {project.preview_thumbnails && project.preview_thumbnails.length > 0 ? (
            /* 2x2 Preview Grid */
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
              {Array.from({ length: 4 }).map((_, i) => {
                const src = project.preview_thumbnails![i];
                return src ? (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div key={i} className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground/20" />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* Decorative grid pattern */}
              <div className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              {/* Film icon placeholder */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="h-10 w-10 text-muted-foreground/30" />
              </div>
            </>
          )}
          {/* Type badge */}
          <div className="absolute top-1.5 left-1.5">
            <span className="flex items-center gap-1 text-[10px] font-medium bg-background/80 backdrop-blur-sm text-muted-foreground px-1.5 py-0.5 rounded border border-border/50">
              <FolderOpen className="h-3 w-3" />
              Проект
            </span>
          </div>
          {/* Actions menu */}
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity" data-no-navigate>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 bg-background/80 backdrop-blur-sm hover:bg-background shadow-sm"
                  aria-label="Действия"
                  onPointerDown={blockCardNavigation}
                  onClick={blockCardNavigation}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44"
                onClick={blockCardNavigation}
              >
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSettingsOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                  onSelect={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Card info */}
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13px] font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <Badge
              variant={STATUS_BADGE_VARIANTS[project.status] ?? "secondary"}
              className="shrink-0 text-[10px]"
            >
              {statusConfig?.label ?? project.status}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {project.element_count ?? 0}
            </span>
            {project.total_spent && parseFloat(project.total_spent) > 0 && (
              <span className="flex items-center gap-1">
                <ChargeIcon size="sm" />
                {formatCurrency(project.total_spent)}
              </span>
            )}
            {(project.storage_bytes ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                {formatStorage(project.storage_bytes!)}
              </span>
            )}
          </div>
        </div>
      </div>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить проект?</DialogTitle>
            <DialogDescription>
              Проект «{project.name}» и все его группы будут удалены безвозвратно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

