"use client";

import { useCallback, useState, useRef, useLayoutEffect, useMemo } from "react";
import { useGenerationStore, ImageFileEntry } from "@/lib/store/generation";
import { useCreditsStore } from "@/lib/store/credits";
import { ElementSelectionModal } from "@/components/element/ElementSelectionModal";
import { PromptThumbnailPopup } from "./PromptThumbnailPopup";
import { ModeSelector } from "./ModeSelector";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";
import { Sparkles, Loader2, ImagePlus } from "lucide-react";
import type { Element, ModalSelectionByScene } from "@/lib/types";
import { isGroupsSchema } from "@/lib/types";

interface PromptBarProps {
  projectId: number;
  sceneId?: number;
  groupId?: number;
  className?: string;
}

const MAX_TEXTAREA_HEIGHT = 144; // 6 строк * 24px

export function PromptBar({ projectId, sceneId, groupId, className }: PromptBarProps) {
  // Resolve the effective groupId: explicit groupId prop takes precedence, then sceneId for backward compat
  const effectiveGroupId = groupId ?? (sceneId && sceneId > 0 ? sceneId : undefined);
  const {
    selectedModel,
    prompt,
    imageInputs,
    selectedGroup,
    isGenerating,
    setPrompt,
    setImageInput,
    selectGroup,
    generate,
    canGenerate,
  } = useGenerationStore();
  
  const canAfford = useCreditsStore((s) => s.canAfford);
  const estimateError = useCreditsStore((s) => s.estimateError);
  const isEstimateLoading = useCreditsStore((s) => s.isEstimateLoading);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(24); // начальная высота 1 строка

  // Modal state
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [activeInputKey, setActiveInputKey] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null); // Для replace конкретного файла
  const [modeSelectorOpen, setModeSelectorOpen] = useState(false);

  // Auto-resize textarea — корректное измерение через cloneNode
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Клонируем textarea для корректного измерения без влияния на DOM
    const clone = textarea.cloneNode(true) as HTMLTextAreaElement;
    clone.style.height = "auto";
    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    clone.style.left = "-9999px";
    clone.style.visibility = "hidden";
    clone.value = textarea.value;
    clone.style.width = `${textarea.offsetWidth}px`;
    
    document.body.appendChild(clone);
    const scrollHeight = clone.scrollHeight;
    document.body.removeChild(clone);

    const newHeight = Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT);
    setTextareaHeight(newHeight);
  }, []);

  // Resize при изменении prompt
  useLayoutEffect(() => {
    resizeTextarea();
  }, [prompt, resizeTextarea]);

  // ResizeObserver для отслеживания изменения ширины контейнера
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      resizeTextarea();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeTextarea]);

  // Есть ли выбранные изображения для отображения в thumbnails-zone
  const hasSelectedImages = useMemo(() => {
    return imageInputs.some((input) => input.files.length > 0);
  }, [imageInputs]);

  // Общее количество выбранных файлов
  const totalSelectedFiles = useMemo(() => {
    return imageInputs.reduce((sum, input) => sum + input.files.length, 0);
  }, [imageInputs]);

  // Groups schema detection
  const groupsSchema = selectedModel && isGroupsSchema(selectedModel.image_inputs_schema)
    ? selectedModel.image_inputs_schema
    : null;

  // Проверка: можно ли выбирать изображения
  const canSelectImages = selectedModel && (imageInputs.length > 0 || !!groupsSchema);

  // Callback for ModeSelector → select group + open modal for specific slot
  const handleSlotSelect = useCallback((groupKey: string, slotKey: string) => {
    selectGroup(groupKey);
    // Defer to next tick so imageInputs is updated from selectGroup
    setTimeout(() => {
      setActiveInputKey(slotKey);
      setActiveFileIndex(null);
      setSelectionModalOpen(true);
    }, 0);
  }, [selectGroup]);

  const handleOpenSelector = useCallback((key: string, fileIndex?: number) => {
    setActiveInputKey(key);
    setActiveFileIndex(fileIndex ?? null);
    setSelectionModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectionModalOpen(false);
    setActiveInputKey(null);
    setActiveFileIndex(null);
  }, []);

  // Конвертация Element[] -> ImageFileEntry[] и установка в store
  const handleSelectionConfirm = useCallback(
    (elements: Element[]) => {
      if (!activeInputKey) return;

      const newFiles: ImageFileEntry[] = elements
        .filter((e) => e.element_type === "IMAGE")
        .map((e) => ({
          displayUrl: e.thumbnail_url || e.file_url,
          apiUrl: e.file_url || e.thumbnail_url,
          elementId: e.id,
        }))
        .filter((f) => f.apiUrl);

      if (activeFileIndex !== null) {
        // Replace mode: заменяем конкретный файл
        const input = imageInputs.find((i) => i.key === activeInputKey);
        if (input) {
          const updatedFiles = [...input.files];
          // Удаляем старый файл по индексу и вставляем новый на его место
          updatedFiles.splice(activeFileIndex, 1, ...newFiles);
          setImageInput(activeInputKey, updatedFiles);
        }
      } else {
        // Add mode: заменяем все файлы (старая логика для dropdown)
        setImageInput(activeInputKey, newFiles);
      }
    },
    [activeInputKey, activeFileIndex, imageInputs, setImageInput]
  );

  const handleGenerate = useCallback(async () => {
    if (!canGenerate()) return;
    await generate(projectId, effectiveGroupId);
    // Show cost toast and reload balance
    const { estimateCost } = useCreditsStore.getState();
    if (estimateCost && parseFloat(estimateCost) > 0) {
      toast.success(`Списано: ${formatCurrency(estimateCost)}`, { duration: 5000 });
    }
    useCreditsStore.getState().loadBalance();
    // Reset textarea height after generation
    setTextareaHeight(24);
  }, [canGenerate, generate, projectId, effectiveGroupId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canGenerate()) {
          handleGenerate();
        }
      }
    },
    [canGenerate, handleGenerate]
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
    },
    [setPrompt]
  );

  // Удаление файла из конкретного input
  const handleRemoveFile = useCallback(
    (inputKey: string, fileIndex: number) => {
      const input = imageInputs.find((i) => i.key === inputKey);
      if (!input) return;

      const newFiles = input.files.filter((_, idx) => idx !== fileIndex);
      setImageInput(inputKey, newFiles);
    },
    [imageInputs, setImageInput]
  )

  // Замена файла (открытие модалки для конкретного файла)
  const handleReplaceFile = useCallback(
    (inputKey: string, fileIndex: number) => {
      handleOpenSelector(inputKey, fileIndex);
    },
    [handleOpenSelector]
  );

  // Получаем информацию об активном input для модалки
  const activeInput = activeInputKey
    ? imageInputs.find((i) => i.key === activeInputKey)
    : null;

  // Подготавливаем initialSelection для модалки (ModalSelectionByScene format)
  // Группируем выбранные elementIds по sceneId (в данном случае все из текущей сцены)
  const initialSelection: ModalSelectionByScene = useMemo(() => {
    if (!activeInput) return {};
    
    const elementIds = activeInput.files
      .map((f) => f.elementId)
      .filter((id): id is number => id !== undefined);
    
    if (elementIds.length === 0) return {};
    
    // All selected elements are from current workspace scene/group
    const targetId = effectiveGroupId ?? 0;
    return targetId > 0 ? { [targetId]: elementIds } : {};
  }, [activeInput, effectiveGroupId]);

  return (
    <div className={cn("p-4", className)}>
      <div
        className={cn(
          "relative flex items-start gap-3 rounded-xl border border-border/30 bg-card p-3 px-4",
          "shadow-lg shadow-black/20",
          "transition-shadow focus-within:border-primary/40 focus-within:shadow-primary/10"
        )}
      >
          {/* Add-кнопка */}
          {canSelectImages ? (
            groupsSchema ? (
              // Groups format → ALWAYS ModeSelector popover
              <ModeSelector
                groups={groupsSchema.groups}
                imageInputs={imageInputs}
                open={modeSelectorOpen}
                onOpenChange={setModeSelectorOpen}
                onSelectSlot={handleSlotSelect}
              >
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    "border border-border/20 bg-muted/30 hover:bg-muted/50 hover:border-border/40",
                    "transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                  aria-label="Добавить изображение"
                >
                  <ImagePlus className="h-4.5 w-4.5 text-muted-foreground" />
                </button>
              </ModeSelector>
            ) : // Simple format (array)
            imageInputs.length === 1 ? (
              <button
                type="button"
                onClick={() => handleOpenSelector(imageInputs[0].key)}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  "border border-border/20 bg-muted/30 hover:bg-muted/50 hover:border-border/40",
                  "transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                )}
                aria-label="Добавить изображение"
              >
                <ImagePlus className="h-4.5 w-4.5 text-muted-foreground" />
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                      "border-dashed border-border/50 bg-transparent hover:bg-muted/20 hover:border-primary/40",
                      "transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                    )}
                    aria-label="Добавить изображение"
                  >
                    <ImagePlus className="h-4.5 w-4.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {imageInputs.map((input) => (
                    <DropdownMenuItem
                      key={input.key}
                      onClick={() => handleOpenSelector(input.key)}
                    >
                      {input.label}
                      {input.required && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          ) : (
            <button
              type="button"
              disabled
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                "border border-border/10 bg-muted/20 opacity-50 cursor-not-allowed"
              )}
              aria-label="Изображения недоступны"
            >
              <ImagePlus className="h-4.5 w-4.5 text-muted-foreground/50" />
            </button>
          )}

          {/* Prompt zone (textarea) */}
          <div ref={containerRef} className="relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              placeholder="Опишите, что хотите сгенерировать..."
              disabled={isGenerating}
              className={cn(
                "w-full resize-none border-0 bg-transparent px-0 pt-0 pb-2 text-sm text-foreground",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-0",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "overflow-y-auto"
              )}
              rows={1}
              style={{ height: `${textareaHeight}px` }}
            />
            {/* Thumbnails-zone (только выбранные изображения) */}
            {hasSelectedImages && (
              <div className="flex flex-wrap gap-2">
                {imageInputs.map((input) =>
                  input.files.map((file, fileIndex) => (
                    <PromptThumbnailPopup
                      key={`${input.key}-${fileIndex}`}
                      url={file.displayUrl}
                      label={input.label}
                      fileIndex={fileIndex}
                      onReplace={(idx) => handleReplaceFile(input.key, idx)}
                      onRemove={() => handleRemoveFile(input.key, fileIndex)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Кнопка Создать */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate() || isGenerating || isEstimateLoading || !!estimateError || !canAfford}
              className={cn(
                "flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white",
                "bg-gradient-to-r from-primary to-[oklch(0.72_0.17_281)] shadow-md shadow-primary/30",
                "hover:shadow-lg hover:shadow-primary/40 hover:brightness-110",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100"
              )}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Создать
            </button>
          </div>
      </div>

      {/* Element Selection Modal */}
      {activeInput && (
        <ElementSelectionModal
          isOpen={selectionModalOpen}
          onClose={handleCloseModal}
          onConfirm={handleSelectionConfirm}
          projectId={projectId}
          currentSceneId={effectiveGroupId ?? 0}
          max={activeFileIndex !== null ? 1 : activeInput.max}
          min={activeFileIndex !== null ? 1 : activeInput.min}
          initialSelection={initialSelection}
          elementTypeFilter="IMAGE"
          title={activeInput.label}
        />
      )}
    </div>
  );
}
