"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  Layers,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { SCENE_STATUSES } from "@/lib/utils/constants";
import { formatElementCount } from "@/lib/utils/format";
import type { Scene } from "@/lib/types";

interface SceneCardProps {
  scene: Scene;
  projectId: number;
  index: number;
  aspectClass?: string;
  fitClass?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-secondary text-secondary-foreground",
  IN_PROGRESS: "bg-primary/15 text-primary",
  REVIEW: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  APPROVED: "bg-green-500/15 text-green-600 dark:text-green-400",
};

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

  const videoRef = useRef<HTMLVideoElement>(null);

  const statusConfig = SCENE_STATUSES.find((s) => s.value === scene.status);

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

  const isVideo =
    scene.headliner_url &&
    (scene.headliner_url.endsWith(".mp4") ||
      scene.headliner_url.endsWith(".webm") ||
      scene.headliner_url.includes("video"));

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onClick={handleCardClick}
        className="group relative bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
      >
        {/* Thumbnail */}
        <div className={cn("bg-muted relative overflow-hidden", aspectClass)}>
          {scene.headliner_url ? (
            isVideo ? (
              <video
                ref={videoRef}
                src={scene.headliner_url}
                className={cn("absolute inset-0 w-full h-full", fitClass)}
                muted
                loop
                playsInline
                onMouseEnter={() => videoRef.current?.play()}
                onMouseLeave={() => {
                  videoRef.current?.pause();
                  if (videoRef.current) videoRef.current.currentTime = 0;
                }}
              />
            ) : (
              <img
                src={scene.headliner_url}
                alt={scene.name}
                loading="lazy"
                className={cn("absolute inset-0 w-full h-full", fitClass)}
              />
            )
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

          {/* Order badge */}
          <div className="absolute top-2 left-2">
            <span className="text-[10px] font-mono font-semibold bg-background/80 backdrop-blur-sm text-muted-foreground px-1.5 py-0.5 rounded border border-border/50">
              #{index + 1}
            </span>
          </div>

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            data-no-navigate
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          >
            <div className="h-7 w-7 bg-background/80 backdrop-blur-sm rounded border border-border/50 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          {/* Status badge overlay */}
          <div className="absolute bottom-2 left-2">
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                STATUS_COLORS[scene.status] ?? "bg-secondary text-secondary-foreground"
              }`}
            >
              {statusConfig?.label ?? scene.status}
            </span>
            
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          {/* Верхняя строка: название + меню */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-sm leading-snug truncate group-hover:text-primary transition-colors min-w-0 flex-1">
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
          {/* Нижняя строка: количество элементов */}
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {formatElementCount(scene.element_count ?? 0)}
          </p>
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
