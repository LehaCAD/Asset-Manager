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
import { useScenesStore } from "@/lib/store/scenes";

interface CreateSceneDialogProps {
  projectId: number;
  parentId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSceneDialog({ projectId, parentId, open, onOpenChange }: CreateSceneDialogProps) {
  const createScene = useScenesStore((s) => s.createScene);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await createScene({ name: name.trim(), project: projectId, parent: parentId ?? null });
      toast.success("Группа создана");
      setName("");
      onOpenChange(false);
    } catch {
      toast.error("Не удалось создать группу");
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
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Добавить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
