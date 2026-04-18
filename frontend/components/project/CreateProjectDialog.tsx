"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
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
import { useProjectsStore } from "@/lib/store/projects";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function suggestName(existingCount: number): string {
  if (existingCount === 0) return "Мой первый проект";
  return `Проект ${existingCount + 1}`;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const createProject = useProjectsStore((s) => s.createProject);
  const projectsCount = useProjectsStore((s) => s.projects.length);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fill default name on each open and select it for easy overwrite
  useEffect(() => {
    if (open) {
      const suggested = suggestName(projectsCount);
      setName(suggested);
      // Focus + select after the dialog mounts
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    }
  }, [open, projectsCount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await createProject({ name: name.trim(), aspect_ratio: "16:9" });
      toastSuccess("Проект создан", { deferrable: "create-project" });
      setName("");
      onOpenChange(false);
    } catch {
      toastError("Не удалось создать проект");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-8">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-xl">Новый проект</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8 pt-4">
          <div className="space-y-3">
            <Label htmlFor="project-name" className="text-[13px] text-muted-foreground">
              Название
            </Label>
            <Input
              ref={inputRef}
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="h-11 text-[15px]"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
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
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
