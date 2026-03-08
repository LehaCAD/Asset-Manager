"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useGenerationStore, ImageFileEntry } from "@/lib/store/generation";
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
import type { Element } from "@/lib/types";

interface PromptBarProps {
  sceneId: number;
  className?: string;
}

const MAX_TEXTAREA_ROWS = 6;
const TEXTAREA_LINE_HEIGHT = 24; // примерная высота строки в px

export function PromptBar({ sceneId, className }: PromptBarProps) {
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaRows, setTextareaRows] = useState(1);

  // Modal state
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [activeInputKey, setActiveInputKey] = useState<string | null>(null);

  // Auto-resize textarea и подсчёт строк
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Сбрасываем высоту для корректного измерения
    textarea.style.height = "auto";

    // Вычисляем количество строк
    const scrollHeight = textarea.scrollHeight;
    const newRows = Math.min(
      Math.max(1, Math.ceil(scrollHeight / TEXTAREA_LINE_HEIGHT)),
      MAX_TEXTAREA_ROWS
    );
    setTextareaRows(newRows);

    // Устанавливаем высоту
    textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_LINE_HEIGHT * MAX_TEXTAREA_ROWS)}px`;
  }, [prompt]);

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

  const handleOpenSelector = useCallback((key: string) => {
    setActiveInputKey(key);
    setSelectionModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectionModalOpen(false);
    setActiveInputKey(null);
  }, []);

  // Конвертация Element[] -> ImageFileEntry[] и установка в store
  const handleSelectionConfirm = useCallback(
    (elements: Element[]) => {
      if (!activeInputKey) return;

      const files: ImageFileEntry[] = elements
        .filter((e) => e.element_type === "IMAGE")
        .map((e) => ({
          displayUrl: e.thumbnail_url || e.file_url,
          apiUrl: e.file_url || e.thumbnail_url,
        }))
        .filter((f) => f.apiUrl);

      setImageInput(activeInputKey, files);
    },
    [activeInputKey, setImageInput]
  );

  const handleGenerate = useCallback(async () => {
    if (!canGenerate()) return;
    await generate(sceneId);
    // Reset textarea height after generation
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      setTextareaRows(1);
    }
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

  // Замена файла (открытие модалки для конкретного input)
  const handleReplaceFile = useCallback(
    (inputKey: string) => {
      handleOpenSelector(inputKey);
    },
    [handleOpenSelector]
  );

  // Получаем информацию об активном input для модалки
  const activeInput = activeInputKey
    ? imageInputs.find((i) => i.key === activeInputKey)
    : null;

  // Подготавливаем initialSelection для модалки (ID элементов на основе URL)
  const initialSelection = useMemo(() => {
    if (!activeInput) return [];
    // TODO: В идеале нужно маппить URL обратно в ID элементов
    // Пока возвращаем пустой массив (без предвыбора)
    return [];
  }, [activeInput]);

  // Кнопка "Создать" справа внизу только если 2+ строк
  const showGenerateAtBottom = textareaRows >= 2;

  return (
    <div className={cn("border-t bg-background p-4", className)}>
      {/* Единый prompt-container */}
      <div
        className={cn(
          "relative flex flex-col gap-3 rounded-xl border border-input bg-background p-3",
          "transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        )}
      >
        {/* Верхний ряд: Add-кнопка | textarea | [Создать] (если 1 строка) */}
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
          <div className="relative flex-1 min-w-0">
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
                  onReplace={() => handleReplaceFile(input.key)}
                  onRemove={() => handleRemoveFile(input.key, fileIndex)}
                />
              ))
            )}
          </div>
        )}
          </div>
 {/* Кнопка Создать (справа внизу, при 2+ строках) */}
 {showGenerateAtBottom && (
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate() || isGenerating}
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
        )}
        </div>



       
      </div>

      {/* Element Selection Modal */}
      {activeInput && (
        <ElementSelectionModal
          isOpen={selectionModalOpen}
          onClose={handleCloseModal}
          onConfirm={handleSelectionConfirm}
          max={activeInput.max}
          min={activeInput.min}
          initialSelection={initialSelection}
          elementTypeFilter="IMAGE"
          title={`Выбор: ${activeInput.label}`}
        />
      )}
    </div>
  );
}
