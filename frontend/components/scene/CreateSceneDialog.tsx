"use client";

import { useEffect, useState } from "react";
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
import { useScenesStore } from "@/lib/store/scenes";

interface CreateSceneDialogProps {
  projectId: number;
  parentId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_SCENE_NAME = "Новая группа";

export function CreateSceneDialog({ projectId, parentId, open, onOpenChange }: CreateSceneDialogProps) {
  const createScene = useScenesStore((s) => s.createScene);
  const [name, setName] = useState(DEFAULT_SCENE_NAME);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) setName(DEFAULT_SCENE_NAME);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await createScene({ name: name.trim(), project: projectId, parent: parentId ?? null });
      toastSuccess("Группа создана", { deferrable: "create-scene" });
      setName(DEFAULT_SCENE_NAME);
      onOpenChange(false);
    } catch {
      toastError("Не удалось создать группу");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Новая группа</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scene-name">Название группы</Label>
            <Input
              id="scene-name"
              placeholder="Группа 1..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              maxLength={120}
            />
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
              Добавить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
