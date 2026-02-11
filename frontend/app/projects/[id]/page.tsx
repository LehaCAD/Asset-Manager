'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useProjectsStore } from '@/lib/store/projects';
import { useAuthStore } from '@/lib/store/auth';
import BoxCard from '@/components/BoxCard';
import NewItemSlot from '@/components/NewItemSlot';
import Modal from '@/components/ui/Modal';
import { getAspectClass, getGridClass } from '@/lib/utils/aspectRatio';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.id);
  const { user } = useAuthStore();

  const {
    currentProject,
    boxes,
    boxesLoading,
    boxesError,
    fetchProject,
    fetchBoxes,
    createBox,
    clearCurrentProject,
    optimisticallyReorderBoxes,
    reorderBoxes,
  } = useProjectsStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      fetchBoxes(projectId);
    }
    return () => clearCurrentProject();
  }, [projectId, fetchProject, fetchBoxes, clearCurrentProject]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    setCreateError('');
    try {
      await createBox(projectId, newName.trim());
      toast.success('Сцена создана');
      setNewName('');
      setShowCreate(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при создании';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDragStart = (event: DragEndEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = boxes.findIndex((b) => b.id === active.id);
      const newIndex = boxes.findIndex((b) => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(boxes, oldIndex, newIndex);
        const boxIds = reordered.map((b) => b.id);
        
        // Optimistic update
        optimisticallyReorderBoxes(boxIds);
        
        // API call
        reorderBoxes(boxIds).catch((e) => {
          console.error('Failed to reorder:', e);
          // Refetch on error to restore correct order
          fetchBoxes(projectId);
        });
      }
    }
  };

  const activeBox = boxes.find((b) => b.id === activeId);
  const aspectClass = currentProject ? getAspectClass(currentProject.aspect_ratio) : 'aspect-video';
  const gridClass = currentProject ? getGridClass(currentProject.aspect_ratio) : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Breadcrumb / Back */}
      <button
        onClick={() => router.push('/projects')}
        className="flex items-center gap-2 text-sm text-txt-muted hover:text-txt-secondary transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Мои проекты
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="min-w-0 flex-1">
          {currentProject ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-txt-primary truncate">
                {currentProject.name}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-txt-muted flex-wrap">
                <span>Сценарный стол</span>
                {user?.quota && (
                  <>
                    <span>•</span>
                    <span>
                      {boxes.length}/{user.quota.max_boxes_per_project} {formatSceneCount(user.quota.max_boxes_per_project)}
                      {boxes.length >= user.quota.max_boxes_per_project && (
                        <span className="ml-1 text-red-500 font-medium">• Лимит</span>
                      )}
                    </span>
                  </>
                )}
                {!user?.quota && boxes.length > 0 && (
                  <>
                    <span>•</span>
                    <span>{boxes.length} {formatSceneCount(boxes.length)}</span>
                  </>
                )}
                {boxes.length > 0 && (
                  <>
                    <span>•</span>
                    <span>{boxes.filter(b => b.status === 'APPROVED').length} утверждено</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="h-8 w-48 skeleton mb-2" />
              <div className="h-4 w-32 skeleton" />
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (user?.quota && boxes.length >= user.quota.max_boxes_per_project) {
              toast.error(`Достигнут лимит сцен (${user.quota.max_boxes_per_project}). Обратитесь к администратору.`);
              return;
            }
            setNewName('');
            setCreateError('');
            setShowCreate(true);
          }}
          disabled={user?.quota ? boxes.length >= user.quota.max_boxes_per_project : false}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0 ml-4 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            user?.quota && boxes.length >= user.quota.max_boxes_per_project
              ? `Достигнут лимит сцен (${user.quota.max_boxes_per_project})`
              : undefined
          }
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">Новая сцена</span>
        </button>
      </div>

      {/* Loading state */}
      {boxesLoading && boxes.length === 0 && (
        <div className={`grid ${gridClass} gap-4`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-surface-border">
              <div className={`${aspectClass} skeleton`} />
              <div className="p-3 bg-surface-secondary">
                <div className="h-4 w-3/4 skeleton mb-2" />
                <div className="h-3 w-1/2 skeleton" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {boxesError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-600 text-sm">{boxesError}</p>
          <button
            onClick={() => fetchBoxes(projectId)}
            className="text-red-500 text-sm underline mt-2 hover:text-red-700"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {/* Empty state */}
      {!boxesLoading && !boxesError && boxes.length === 0 && currentProject && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-surface-secondary flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-txt-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-txt-primary mb-2">Нет сцен</h3>
          <p className="text-sm text-txt-muted text-center max-w-sm mb-6">
            Добавьте первую сцену для начала работы над проектом
          </p>
          <button
            onClick={() => {
              setNewName('');
              setCreateError('');
              setShowCreate(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Создать сцену
          </button>
        </div>
      )}

      {/* Boxes grid */}
      {!boxesLoading && boxes.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={boxes.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className={`grid ${gridClass} gap-4`}>
              {boxes.map((box, index) => (
                <BoxCard key={box.id} box={box} index={index} aspectClass={aspectClass} />
              ))}
              {/* New Scene Slot */}
              {(!user?.quota || boxes.length < user.quota.max_boxes_per_project) && (
                <NewItemSlot
                  label="Новая сцена"
                  aspectClass={aspectClass}
                  onClick={() => {
                    setNewName('');
                    setCreateError('');
                    setShowCreate(true);
                  }}
                />
              )}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeBox ? (
              <div className="opacity-50">
                <BoxCard box={activeBox} index={boxes.findIndex((b) => b.id === activeBox.id)} aspectClass={aspectClass} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Новая сцена">
        <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
            placeholder="Например: Сцена 1 — Открытие"
            autoFocus
          />
          {createError && <p className="text-red-500 text-xs mt-2">{createError}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm font-medium text-txt-secondary bg-surface-tertiary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={createLoading || !newName.trim()}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {createLoading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function formatSceneCount(count: number): string {
  if (count === 0) return 'сцен';
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'сцен';
  if (lastDigit === 1) return 'сцена';
  if (lastDigit >= 2 && lastDigit <= 4) return 'сцены';
  return 'сцен';
}
