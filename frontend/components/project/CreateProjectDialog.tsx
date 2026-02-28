"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProjectsStore } from "@/lib/store/projects";
import type { AspectRatio } from "@/lib/types";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const createProject = useProjectsStore((s) => s.createProject);
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await createProject({ name: name.trim(), aspect_ratio: aspectRatio });
      toast.success("Проект создан");
      setName("");
      setAspectRatio("16:9");
      onOpenChange(false);
    } catch {
      toast.error("Не удалось создать проект");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый проект</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="project-name">Название</Label>
            <Input
              id="project-name"
              placeholder="Название проекта..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
            />
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
                <span className="text-xs text-muted-foreground hidden sm:block">Горизонтальный</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="9:16" className="flex items-center gap-2 px-4 h-auto py-2.5">
                <span className="inline-block w-4 h-7 border-2 border-current rounded-sm" />
                <span className="text-sm">9:16</span>
                <span className="text-xs text-muted-foreground hidden sm:block">Вертикальный</span>
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
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
