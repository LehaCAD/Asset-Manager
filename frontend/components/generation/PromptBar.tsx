"use client";

import { useCallback, useState, useRef, useLayoutEffect, useMemo } from "react";
import { useGenerationStore, ImageFileEntry } from "@/lib/store/generation";
import { useCreditsStore } from "@/lib/store/credits";
import { ElementSelectionModal } from "@/components/element/ElementSelectionModal";
import { PromptThumbnailPopup } from "./PromptThumbnailPopup";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Sparkles, Loader2, Plus } from "lucide-react";
import type { Element, ModalSelectionByScene } from "@/lib/types";

interface PromptBarProps {
  projectId: number;
  sceneId: number;
  className?: string;
}

const MAX_TEXTAREA_HEIGHT = 144; // 6 строк * 24px

export function PromptBar({ projectId, sceneId, className }: PromptBarProps) {
  const {
    selectedModel,
    prompt,
    imageInputs,
    isGenerating,
    setPrompt,
    setImageInput,
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

  // Проверка: можно ли выбирать изображения (есть ли модель со схемой)
  const canSelectImages = selectedModel && imageInputs.length > 0;

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
    await generate(sceneId);
    // Reset textarea height after generation
    setTextareaHeight(24);
  }, [canGenerate, generate, sceneId]);

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
    
    // All selected elements are from current workspace scene
    return { [sceneId]: elementIds };
  }, [activeInput, sceneId]);

  return (
    <div className={cn("border-t bg-background p-4", className)}>
      {/* Единый prompt-container */}
      <div
        className={cn(
          "relative flex flex-col gap-3 rounded-xl border border-input bg-background p-3",
          "transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        )}
      >
        {/* Верхний ряд: Add-кнопка | textarea | Создать */}
        <div className="flex items-start gap-3">
          {/* Add-кнопка */}
          {canSelectImages ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                    "border-dashed border-input bg-muted hover:bg-accent hover:border-accent-foreground/50",
                    "transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                  aria-label="Добавить изображение"
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {imageInputs.length === 1 ? (
                  <DropdownMenuItem
                    onClick={() => handleOpenSelector(imageInputs[0].key)}
                  >
                    Выбрать изображение
                  </DropdownMenuItem>
                ) : (
                  imageInputs.map((input) => (
                    <DropdownMenuItem
                      key={input.key}
                      onClick={() => handleOpenSelector(input.key)}
                    >
                      {input.label}
                      {input.required && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              disabled
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                "border-dashed border-input bg-muted opacity-50 cursor-not-allowed"
              )}
              aria-label="Изображения недоступны"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
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
                "w-full resize-none border-0 bg-transparent px-0 pt-0 pb-2 text-sm",
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

          {/* Кнопка Создать — всегда видна справа */}
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate() || isGenerating || isEstimateLoading || !!estimateError || !canAfford}
              className="h-10"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Создать
            </Button>
          </div>
        </div>



       
      </div>

      {/* Element Selection Modal */}
      {activeInput && (
        <ElementSelectionModal
          isOpen={selectionModalOpen}
          onClose={handleCloseModal}
          onConfirm={handleSelectionConfirm}
          projectId={projectId}
          currentSceneId={sceneId}
          max={activeFileIndex !== null ? 1 : activeInput.max}
          min={activeFileIndex !== null ? 1 : activeInput.min}
          initialSelection={initialSelection}
          elementTypeFilter="IMAGE"
          title={`Выбор: ${activeInput.label}`}
        />
      )}
    </div>
  );
}
