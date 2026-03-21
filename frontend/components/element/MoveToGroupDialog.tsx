'use client';

import { useCallback, useEffect, useState } from 'react';
import { scenesApi } from '@/lib/api/scenes';
import { elementsApi } from '@/lib/api/elements';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Folder, ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/types';

interface MoveToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  selectedElementIds: number[];
  selectedGroupIds: number[];
  currentGroupId?: number;
  onMoved: () => void;
}

interface GroupTreeNode {
  group: Scene;
  children: GroupTreeNode[];
  depth: number;
  disabled: boolean;
}

export function MoveToGroupDialog({
  open,
  onOpenChange,
  projectId,
  selectedElementIds,
  selectedGroupIds,
  currentGroupId,
  onMoved,
}: MoveToGroupDialogProps) {
  const [allGroups, setAllGroups] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null); // null = project root

  // Fetch all groups when dialog opens
  useEffect(() => {
    if (!open) return;

    setIsLoading(true);
    setSelectedTarget(null);

    scenesApi
      .getByProject(projectId)
      .then((groups) => {
        setAllGroups(groups);
      })
      .catch(() => {
        toast.error('Не удалось загрузить группы');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, projectId]);

  // Build tree structure from flat list
  const buildTree = useCallback((): GroupTreeNode[] => {
    const selectedGroupSet = new Set(selectedGroupIds);
    const excludeSet = new Set<number>();

    // Exclude current group and selected groups
    if (currentGroupId) excludeSet.add(currentGroupId);
    selectedGroupIds.forEach((id) => excludeSet.add(id));

    // Filter out excluded groups
    const available = allGroups.filter((g) => !excludeSet.has(g.id));

    // Build map for tree construction
    const childrenMap = new Map<number | null, Scene[]>();
    for (const group of available) {
      const parentKey = group.parent;
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, []);
      }
      childrenMap.get(parentKey)!.push(group);
    }

    // Check if moving groups — disable targets that would exceed 2-level nesting
    const isMovingGroups = selectedGroupIds.length > 0;

    // Get max depth of selected groups (including their children)
    const getSubtreeDepth = (groupId: number): number => {
      const children = allGroups.filter((g) => g.parent === groupId);
      if (children.length === 0) return 0;
      return 1 + Math.max(...children.map((c) => getSubtreeDepth(c.id)));
    };

    let maxSelectedSubtreeDepth = 0;
    if (isMovingGroups) {
      for (const gid of selectedGroupIds) {
        maxSelectedSubtreeDepth = Math.max(
          maxSelectedSubtreeDepth,
          1 + getSubtreeDepth(gid),
        );
      }
    }

    const buildNodes = (parentId: number | null, depth: number): GroupTreeNode[] => {
      const children = childrenMap.get(parentId) || [];
      return children
        .sort((a, b) => a.order_index - b.order_index)
        .map((group) => {
          // When moving groups, disable targets where nesting would exceed 2 levels
          // Max allowed depth = 2 (root level = 0, first nesting = 1)
          const targetDepth = depth; // depth of the target group itself
          const wouldExceedNesting =
            isMovingGroups && targetDepth + maxSelectedSubtreeDepth > 2;

          return {
            group,
            children: buildNodes(group.id, depth + 1),
            depth,
            disabled: wouldExceedNesting,
          };
        });
    };

    return buildNodes(null, 1); // root children start at depth 1
  }, [allGroups, currentGroupId, selectedGroupIds]);

  const tree = open ? buildTree() : [];

  // Handle move
  const handleMove = async () => {
    if (selectedElementIds.length === 0 && selectedGroupIds.length === 0) return;

    setIsMoving(true);
    try {
      await elementsApi.move({
        element_ids: selectedElementIds.length > 0 ? selectedElementIds : undefined,
        group_ids: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
        target_scene: selectedTarget,
      });
      toast.success('Перемещено');
      onOpenChange(false);
      onMoved();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось переместить';
      toast.error(message);
    } finally {
      setIsMoving(false);
    }
  };

  // Render tree node
  const renderNode = (node: GroupTreeNode) => {
    const isSelected = selectedTarget === node.group.id;

    return (
      <div key={node.group.id}>
        <button
          type="button"
          disabled={node.disabled}
          onClick={() => setSelectedTarget(node.group.id)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted',
            node.disabled && 'opacity-40 cursor-not-allowed',
          )}
          style={{ paddingLeft: `${12 + node.depth * 20}px` }}
        >
          {node.children.length > 0 && (
            <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
          )}
          <Folder className="w-4 h-4 shrink-0" />
          <span className="truncate">{node.group.name}</span>
        </button>
        {node.children.map(renderNode)}
      </div>
    );
  };

  const totalItems = selectedElementIds.length + selectedGroupIds.length;
  const isRootSelected = selectedTarget === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Переместить в группу</DialogTitle>
          <DialogDescription>
            {totalItems === 1
              ? 'Выберите группу для перемещения элемента'
              : `Выберите группу для перемещения (${totalItems} шт.)`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto border rounded-md p-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Загрузка...
            </div>
          ) : (
            <>
              {/* Project root option */}
              <button
                type="button"
                onClick={() => setSelectedTarget(null)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
                  isRootSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <Home className="w-4 h-4 shrink-0" />
                <span>Корень проекта</span>
              </button>

              {tree.map(renderNode)}

              {tree.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Нет доступных групп
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isMoving}>
            Отмена
          </Button>
          <Button onClick={handleMove} disabled={isMoving || isLoading}>
            {isMoving ? 'Перемещение...' : 'Переместить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
