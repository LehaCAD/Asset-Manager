'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient, type Element, type Scene, type Project } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth';
import AssetThumbnail from '@/components/AssetThumbnail';
import DropZone from '@/components/DropZone';
import AddAssetSlot from '@/components/AddAssetSlot';
import UploadProgress, { type UploadItem } from '@/components/UploadProgress';
import { getAspectClass, getGridClass } from '@/lib/utils/aspectRatio';

type FilterType = 'all' | 'favorite' | 'image' | 'video';

const STATUS_CONFIG = {
  DRAFT: { label: 'Черновик', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  REVIEW: { label: 'На проверке', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Утверждён', color: 'bg-green-100 text-green-700' },
} as const;

// Sortable wrapper for ElementThumbnail
interface SortableElementProps {
  asset: Element;
  index: number;
  isSelected: boolean;
  isHeadliner: boolean;
  onSelect: () => void;
  onSetHeadliner: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  dragHandleProps?: Record<string, unknown>;
  aspectClass?: string;
}

function SortableElementThumbnail(props: SortableElementProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.asset.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <AssetThumbnail {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export default function SceneDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.id);
  const sceneId = Number(params.boxId);
  const { user } = useAuthStore();

  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedElement, setSelectedElement] = useState<Element | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [activeElementId, setActiveElementId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectData, sceneData, elementsData] = await Promise.all([
        apiClient.getProject(projectId),
        apiClient.getScene(sceneId),
        apiClient.getElements(sceneId),
      ]);
      setProject(projectData);
      setScene(sceneData);
      setElements(elementsData);
      if (elementsData.length > 0 && !selectedElement) {
        setSelectedElement(elementsData[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  const handleSetHeadliner = async (elementId: number) => {
    try {
      const updatedScene = await apiClient.setHeadliner(sceneId, elementId);
      setScene(updatedScene);
      toast.success('Лучший элемент установлен');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const handleToggleFavorite = async (element: Element) => {
    try {
      const updated = await apiClient.updateElement(element.id, {
        is_favorite: !element.is_favorite,
      });
      setElements(elements.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedElement?.id === updated.id) {
        setSelectedElement(updated);
      }
      toast.success(updated.is_favorite ? 'Добавлено в избранное' : 'Удалено из избранного');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const handleDeleteElement = async (elementId: number) => {
    try {
      await apiClient.deleteElement(elementId);
      const newElements = elements.filter((a) => a.id !== elementId);
      setElements(newElements);
      if (selectedElement?.id === elementId) {
        setSelectedElement(newElements[0] || null);
      }
      // Reload scene to update counter
      const updatedScene = await apiClient.getScene(sceneId);
      setScene(updatedScene);
      toast.success('Элемент удалён');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    }
  };

  const handleStatusChange = async (newStatus: Scene['status']) => {
    if (!scene) return;
    setStatusLoading(true);
    try {
      const updated = await apiClient.updateScene(scene.id, { status: newStatus });
      setScene(updated);
      setShowStatusModal(false);
      toast.success('Статус сцены изменён');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    // Check quota limits
    if (user?.quota && elements.length >= user.quota.max_elements_per_scene) {
      toast.error(`Достигнут лимит элементов (${user.quota.max_elements_per_scene}). Обратитесь к администратору.`);
      return;
    }

    // Check if adding these files will exceed the limit
    if (user?.quota && elements.length + files.length > user.quota.max_elements_per_scene) {
      toast.error(`Можно загрузить только ${user.quota.max_elements_per_scene - elements.length} файлов (лимит: ${user.quota.max_elements_per_scene})`);
      return;
    }

    const newUploads: UploadItem[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'uploading' as const,
    }));

    setUploads((prev) => [...prev, ...newUploads]);

    for (const upload of newUploads) {
      try {
        const element = await apiClient.uploadFile(sceneId, upload.file, (progress) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === upload.id ? { ...u, progress } : u))
          );
        });

        // Mark as completed
        setUploads((prev) =>
          prev.map((u) => (u.id === upload.id ? { ...u, status: 'completed' as const } : u))
        );

        // Add element to the list
        setElements((prev) => [...prev, element]);

        // Reload scene to update counter
        const updatedScene = await apiClient.getScene(sceneId);
        setScene(updatedScene);

        // Auto-select first element if none selected
        if (!selectedElement) {
          setSelectedElement(element);
        }

        toast.success(`${upload.file.name} загружен`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Ошибка загрузки';
        setUploads((prev) =>
          prev.map((u) =>
            u.id === upload.id
              ? {
                  ...u,
                  status: 'error' as const,
                  error: errMsg,
                }
              : u
          )
        );
        toast.error(`Ошибка загрузки ${upload.file.name}: ${errMsg}`);
      }
    }

    // Clear completed uploads after 3 seconds
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.status !== 'completed'));
    }, 3000);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveElementId(event.active.id as number);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveElementId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = filteredElements.findIndex((a) => a.id === active.id);
    const newIndex = filteredElements.findIndex((a) => a.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic update
    const newElements = [...filteredElements];
    const [movedElement] = newElements.splice(oldIndex, 1);
    newElements.splice(newIndex, 0, movedElement);

    // Update order_index for all elements
    const updatedElements = newElements.map((element, index) => ({
      ...element,
      order_index: index,
    }));

    setElements(updatedElements);

    try {
      // Send reorder request
      await apiClient.reorderElements(updatedElements.map((a) => a.id));
      toast.success('Порядок элементов обновлён');
    } catch (e) {
      // Revert on error
      const msg = e instanceof Error ? e.message : 'Ошибка';
      toast.error(msg);
      loadData();
    }
  };

  const filteredElements = elements.filter((element) => {
    if (filter === 'favorite') return element.is_favorite;
    if (filter === 'image') return element.asset_type === 'IMAGE';
    if (filter === 'video') return element.asset_type === 'VIDEO';
    return true;
  });

  const aspectClass = project ? getAspectClass(project.aspect_ratio) : 'aspect-square';
  const elementsGridClass = project ? getGridClass(project.aspect_ratio, 'box') : 'grid-cols-2';

  if (loading) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="h-8 w-48 skeleton mb-6" />
        <div className="flex gap-6 h-[calc(100vh-200px)]">
          <div className="flex-1 skeleton rounded-xl" />
          <div className="w-80 skeleton rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !scene) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-600 text-sm">{error || 'Сцена не найдена'}</p>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="text-red-500 text-sm underline mt-2"
          >
            Вернуться к проекту
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-txt-muted mb-4">
        <button
          onClick={() => router.push('/projects')}
          className="hover:text-txt-secondary transition-colors"
        >
          Проекты
        </button>
        <span>/</span>
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="hover:text-txt-secondary transition-colors"
        >
          {scene.project_name}
        </button>
        <span>/</span>
        <span className="text-txt-primary font-medium">{scene.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-txt-primary">
            {scene.name}
          </h1>
          <button
            onClick={() => setShowStatusModal(true)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${STATUS_CONFIG[scene.status].color} hover:opacity-80`}
          >
            {STATUS_CONFIG[scene.status].label}
          </button>
        </div>
        <div className="text-sm text-txt-muted">
          {user?.quota ? (
            <>
              {elements.length}/{user.quota.max_elements_per_scene} {formatElementCount(user.quota.max_elements_per_scene)}
              {elements.length >= user.quota.max_elements_per_scene && (
                <span className="ml-2 text-red-500 font-medium">• Лимит</span>
              )}
            </>
          ) : (
            <>{elements.length} {formatElementCount(elements.length)}</>
          )}
        </div>
      </div>

      {/* Main content */}
      {elements.length === 0 ? (
        /* Empty state: fullscreen DropZone */
        <div className="min-h-[calc(100vh-300px)] flex items-center justify-center">
          <div className="w-full max-w-2xl">
            <DropZone onFilesSelected={handleFilesSelected} disabled={uploads.some((u) => u.status === 'uploading')} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Main viewer (70%) */}
          <div className="flex-1 bg-surface-secondary rounded-xl overflow-hidden flex items-center justify-center min-h-[300px] max-h-[calc(100vh-200px)]">
            {selectedElement ? (
              <div className="relative w-full h-full flex items-center justify-center p-8">
                <div className="rounded-xl overflow-hidden shadow-lg">
                  {selectedElement.asset_type === 'VIDEO' ? (
                    <video
                      src={selectedElement.file_url}
                      controls
                      loop
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : (
                    <Image
                      src={selectedElement.file_url}
                      alt={`Элемент #${selectedElement.order_index + 1}`}
                      width={1200}
                      height={800}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  )}
                </div>
              </div>
            ) : (
              <p className="text-txt-muted">Выберите элемент</p>
            )}
          </div>

          {/* Sidebar (30%) */}
          <div className="w-full sm:w-80 flex flex-col gap-4">
            {/* Filters */}
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'Все', icon: null },
                { id: 'favorite', label: '', icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                )},
                { id: 'image', label: 'Фото', icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                )},
                { id: 'video', label: 'Видео', icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                )},
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as FilterType)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    filter === f.id
                      ? 'bg-accent text-white'
                      : 'bg-surface-secondary text-txt-secondary hover:bg-surface-hover'
                  }`}
                >
                  {f.icon}{f.label}
                </button>
              ))}
            </div>

            {/* Element grid */}
            <div className="flex-1 overflow-y-auto bg-surface-secondary rounded-xl p-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredElements.map((a) => a.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className={`grid ${elementsGridClass} gap-3`}>
                    {filteredElements.map((element, index) => (
                      <SortableElementThumbnail
                        key={element.id}
                        asset={element}
                        index={index}
                        isSelected={selectedElement?.id === element.id}
                        isHeadliner={scene.headliner === element.id}
                        onSelect={() => setSelectedElement(element)}
                        onSetHeadliner={() => handleSetHeadliner(element.id)}
                        onToggleFavorite={() => handleToggleFavorite(element)}
                        onDelete={() => handleDeleteElement(element.id)}
                        aspectClass={aspectClass}
                      />
                    ))}
                    
                    {/* Add Element Slot */}
                    {user?.quota && elements.length < user.quota.max_elements_per_scene && (
                      <AddAssetSlot
                        onFilesSelected={handleFilesSelected}
                        disabled={uploads.some((u) => u.status === 'uploading')}
                        aspectClass={aspectClass}
                      />
                    )}
                  </div>
                </SortableContext>

                <DragOverlay>
                  {activeElementId ? (
                    <div className="opacity-80 scale-110">
                      <AssetThumbnail
                        asset={filteredElements.find((a) => a.id === activeElementId)!}
                        index={filteredElements.findIndex((a) => a.id === activeElementId)}
                        isSelected={false}
                        isHeadliner={scene.headliner === activeElementId}
                        onSelect={() => {}}
                        onSetHeadliner={() => {}}
                        onToggleFavorite={() => {}}
                        onDelete={() => {}}
                        aspectClass={aspectClass}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress */}
      <UploadProgress uploads={uploads} />

      {/* Status change modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-txt-primary mb-4">Изменить статус</h3>
            <div className="space-y-2">
              {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                        disabled={statusLoading || scene.status === status}
                  className={`w-full px-4 py-3 text-left rounded-lg border transition-all ${
                    scene.status === status
                      ? 'border-accent bg-accent/5 cursor-default'
                      : 'border-surface-border hover:border-accent/50 hover:bg-surface-secondary'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-txt-primary">
                      {STATUS_CONFIG[status].label}
                    </span>
                    {scene.status === status && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-accent"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowStatusModal(false)}
              className="w-full mt-4 px-4 py-2 text-sm font-medium text-txt-secondary bg-surface-tertiary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatElementCount(count: number): string {
  if (count === 0) return 'элементов';
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'элементов';
  if (lastDigit === 1) return 'элемент';
  if (lastDigit >= 2 && lastDigit <= 4) return 'элемента';
  return 'элементов';
}
