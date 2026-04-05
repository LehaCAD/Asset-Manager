"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Film, Layers, HardDrive, Folder, Share2 } from "lucide-react";
import { ChargeIcon } from "@/components/ui/charge-icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { CreateLinkDialog } from "@/components/sharing/CreateLinkDialog";
import { sharingApi } from "@/lib/api/sharing";
import { useProjectsStore } from "@/lib/store/projects";
import { PROJECT_STATUSES } from "@/lib/utils/constants";
import { formatStorage, formatCurrency, formatRelativeDate } from "@/lib/utils/format";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
}


export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareElements, setShareElements] = useState<Array<{ id: number; element_type: string; is_favorite: boolean; source_type: string }>>([]);
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
        {/* Preview area */}
        <div className="aspect-video bg-muted relative overflow-hidden">
          {(() => {
            const thumbs = project.preview_thumbnails ?? [];
            const count = thumbs.length;

            if (count === 0) {
              return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                  <Film className="h-8 w-8 text-muted-foreground/20" />
                  <span className="text-[11px] text-muted-foreground/30">Нет элементов</span>
                </div>
              );
            }

            if (count === 1) {
              return (
                <div className="absolute inset-0 p-1.5">
                  <img src={thumbs[0]} alt="" className="w-full h-full rounded-md object-cover" />
                </div>
              );
            }

            // 2+ thumbnails: hero + side column
            const sideCount = Math.min(count - 1, 3);
            return (
              <div className="absolute inset-0 p-1.5 flex gap-1">
                <img src={thumbs[0]} alt="" className="flex-1 min-w-0 h-full object-cover rounded-md" />
                <div className="flex flex-col gap-1 w-[100px]">
                  {thumbs.slice(1, 1 + sideCount).map((src, i) => (
                    <img key={i} src={src} alt="" className="w-full flex-1 min-h-0 object-cover rounded-md" />
                  ))}
                </div>
              </div>
            );
          })()}

        </div>

        {/* Footer */}
        <div className="px-3.5 py-3 space-y-1.5 border-t border-border">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h3 className="text-base font-medium leading-tight line-clamp-1 group-hover:text-primary transition-colors flex-1 min-w-0">
              {project.name}
            </h3>
            <div data-no-navigate className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-muted"
                    aria-label="Действия"
                    onPointerDown={blockCardNavigation}
                    onClick={blockCardNavigation}
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
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
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={async () => {
                      setShareLoading(true);
                      try {
                        const els = await sharingApi.getProjectElements(project.id);
                        if (els.length === 0) { toast.error('В проекте нет элементов'); return; }
                        setShareElements(els);
                        setShareOpen(true);
                      } catch { toast.error('Не удалось загрузить элементы'); }
                      finally { setShareLoading(false); }
                    }}
                  >
                    <Share2 className="mr-2 h-3.5 w-3.5" />
                    {shareLoading ? 'Загрузка...' : 'Поделиться'}
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
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground items-center">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusConfig?.color ?? "bg-muted-foreground"}`} />
            <span>{statusConfig?.label ?? project.status}</span>
            {(project.scene_count ?? 0) > 0 && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span className="flex items-center gap-0.5">
                  <Folder className="h-3 w-3" />
                  {project.scene_count}
                </span>
              </>
            )}
            <span className="text-muted-foreground/40">&middot;</span>
            <span className="flex items-center gap-0.5">
              <Layers className="h-3 w-3" />
              {project.element_count ?? 0}
            </span>
            {project.total_spent && parseFloat(project.total_spent) > 0 && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span className="flex items-center gap-0.5">
                  <ChargeIcon size="xs" />
                  {formatCurrency(project.total_spent)}
                </span>
              </>
            )}
            {(project.storage_bytes ?? 0) > 0 && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span className="flex items-center gap-0.5">
                  <HardDrive className="h-3 w-3" />
                  {formatStorage(project.storage_bytes!)}
                </span>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground/60">
            {formatRelativeDate(project.updated_at)}
          </div>
        </div>
      </div>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <CreateLinkDialog
        isOpen={shareOpen}
        onClose={() => { setShareOpen(false); setShareElements([]); }}
        projectId={project.id}
        elementIds={shareElements.map(e => e.id)}
        elements={shareElements}
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

