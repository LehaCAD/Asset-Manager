"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProjectsStore } from "@/lib/store/projects";
import { PROJECT_STATUSES } from "@/lib/utils/constants";
import type { Project, ProjectStatus, AspectRatio } from "@/lib/types";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsDialog({ project, open, onOpenChange }: ProjectSettingsDialogProps) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(project.aspect_ratio);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setStatus(project.status);
      setAspectRatio(project.aspect_ratio);
    }
  }, [open, project]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        status,
        aspect_ratio: aspectRatio,
      });
      toast.success("Проект обновлён");
      onOpenChange(false);
    } catch {
      toast.error("Не удалось обновить проект");
    } finally {
      setIsLoading(false);
    }
  }

  const currentStatus = PROJECT_STATUSES.find((s) => s.value === status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки проекта</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Название</Label>
            <Input
              id="settings-name"
              placeholder="Название проекта..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Статус</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <span className={`mr-2 h-2 w-2 rounded-full ${currentStatus?.color.replace("text-", "bg-")}`} />
                  {currentStatus?.label ?? status}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full min-w-[180px]">
                {PROJECT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={() => setStatus(s.value as ProjectStatus)}
                    className="cursor-pointer"
                  >
                    <span className={`mr-2 h-2 w-2 rounded-full ${s.color.replace("text-", "bg-")}`} />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label>Соотношение сторон</Label>
            <ToggleGroup
              type="single"
              value={aspectRatio}
              onValueChange={(v) => v && setAspectRatio(v as AspectRatio)}
              className="justify-start gap-2"
            >
              <ToggleGroupItem value="16:9" className="flex items-center gap-2 px-4 h-auto py-2.5">
                <span className="inline-block w-7 h-4 border-2 border-current rounded-sm" />
                <span className="text-sm">16:9</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="9:16" className="flex items-center gap-2 px-4 h-auto py-2.5">
                <span className="inline-block w-4 h-7 border-2 border-current rounded-sm" />
                <span className="text-sm">9:16</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
