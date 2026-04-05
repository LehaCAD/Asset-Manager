"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  Layers,
  HardDrive,
  ImageIcon,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { ChargeIcon } from "@/components/ui/charge-icon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScenesStore } from "@/lib/store/scenes";
import { scenesApi } from "@/lib/api/scenes";
import { formatElementCount, formatCurrency, formatStorage } from "@/lib/utils/format";
import type { Scene } from "@/lib/types";

interface SceneCardProps {
  scene: Scene;
  projectId: number;
  index: number;
  aspectClass?: string;
  fitClass?: string;
}

export function SceneCard({ scene, projectId, index, aspectClass = "aspect-video", fitClass = "object-cover" }: SceneCardProps) {
  const router = useRouter();
  const updateScene = useScenesStore((s) => s.updateScene);
  const deleteScene = useScenesStore((s) => s.deleteScene);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editName, setEditName] = useState(scene.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDeleteInfo, setIsLoadingDeleteInfo] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<{
    element_count: number;
    children_count: number;
    total_elements_affected: number;
  } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-navigate]")) return;
    router.push(`/projects/${projectId}/scenes/${scene.id}`);
  }

  function blockCardNavigation(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSaving(true);
    try {
      await updateScene(scene.id, { name: editName.trim() });
      toast.success("Группа обновлена");
      setEditOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось обновить группу";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteScene(scene.id);
      toast.success("Группа удалена");
      setDeleteOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось удалить группу";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onClick={handleCardClick}
        className="group relative bg-card border border-border rounded-md overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-150"
      >
        {/* Thumbnail area */}
        <div className={cn("bg-muted relative overflow-hidden", aspectClass)}>
          {scene.preview_thumbnails && scene.preview_thumbnails.length > 0 ? (
            /* 2x2 preview grid */
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
              {[0, 1, 2, 3].map((i) => {
                const url = scene.preview_thumbnails![i];
                return url ? (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    key={i}
                    className="w-full h-full bg-muted-foreground/5 flex items-center justify-center"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/20" />
                  </div>
                );
              })}
            </div>
          ) : (scene.headliner_thumbnail_url || scene.headliner_url) ? (
            <img
              src={scene.headliner_thumbnail_url ?? scene.headliner_url!}
              alt=""
              loading="lazy"
              className={cn("absolute inset-0 w-full h-full", fitClass)}
            />
          ) : (
            <>
              <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </>
          )}

          {/* Type badge */}
          <div className="absolute top-1.5 left-1.5">
            <span className="flex items-center gap-1 text-[10px] font-medium bg-background/80 backdrop-blur-sm text-muted-foreground px-1.5 py-0.5 rounded border border-border/50">
              <FolderOpen className="h-3 w-3" />
              Группа
            </span>
          </div>

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            data-no-navigate
            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          >
            <div className="h-7 w-7 bg-background/80 backdrop-blur-sm rounded-md border border-border/50 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

        </div>

        {/* Footer — compact info */}
        <div className="p-2.5">
          {/* Title row + menu */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-medium leading-tight truncate group-hover:text-primary transition-colors duration-150 min-w-0 flex-1">
              {scene.name}
            </h3>
            <div data-no-navigate>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mr-1"
                    aria-label="Действия"
                    onPointerDown={blockCardNavigation}
                    onClick={blockCardNavigation}
                  >
                    <MoreHorizontal className="h-4 w-4" />
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
                      setEditName(scene.name);
                      setEditOpen(true);
                    }}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Переименовать
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                    onSelect={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsLoadingDeleteInfo(true);
                      try {
                        const info = await scenesApi.getDeleteInfo(scene.id);
                        setDeleteInfo(info);
                      } catch {
                        setDeleteInfo(null);
                      } finally {
                        setIsLoadingDeleteInfo(false);
                      }
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
          {/* Meta row */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {formatElementCount(scene.element_count ?? scene.elements_count ?? 0)}
            </span>
            {scene.total_spent && parseFloat(scene.total_spent) > 0 && (
              <span className="flex items-center gap-1">
                <ChargeIcon size="sm" />
                {formatCurrency(scene.total_spent)}
              </span>
            )}
            {(scene.storage_bytes ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                {formatStorage(scene.storage_bytes!)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Переименовать группу</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-scene-name">Название</Label>
              <Input
                id="edit-scene-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                maxLength={120}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditOpen(false)}
                disabled={isSaving}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={!editName.trim() || isSaving}>
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить группу?</DialogTitle>
            <DialogDescription>
              {deleteInfo && deleteInfo.children_count > 0
                ? `Удаление группы также удалит ${deleteInfo.children_count} подгрупп. Все ${deleteInfo.total_elements_affected} элементов будут перемещены в корень проекта.`
                : deleteInfo && deleteInfo.total_elements_affected > 0
                  ? `Удаление группы переместит ${deleteInfo.total_elements_affected} элементов в корень проекта.`
                  : `Группа «${scene.name}» будет удалена.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
