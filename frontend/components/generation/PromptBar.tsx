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
import { PromptEnhanceToggle } from "./PromptEnhanceToggle";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { Loader2, ImagePlus, ClipboardCopy, ArrowUp } from "lucide-react";
import type { Element, ModalSelectionByScene } from "@/lib/types";
import { isGroupsSchema } from "@/lib/types";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { useHintDismissal } from "@/lib/hooks/useHintDismissal";
import { HintBubble } from "@/components/onboarding/HintBubble";

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
  // Subscribed separately so the button price only re-renders when estimateCost changes
  // — not on every unrelated credits-store field update.
  const estimateCost = useCreditsStore((s) => s.estimateCost);

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

  // Onboarding hint: "write a prompt" with a clickable example.
  // Disappears once first_generation is completed or user dismisses it.
  const onboardingTasks = useOnboardingStore((s) => s.tasks);
  const onboardingLoaded = useOnboardingStore((s) => s.isLoaded);
  const firstGenDone = onboardingTasks.find((t) => t.code === "first_generation")?.completed;
  const hintDismissal = useHintDismissal("prompt-bar");
  const [hintClosing, setHintClosing] = useState(false);
  // Gate on `isLoaded` so we don't flash the hint for old accounts while tasks hydrate.
  const showPromptHint =
    onboardingLoaded && !firstGenDone && hintDismissal.hydrated && !hintDismissal.dismissed;
  const EXAMPLE_PROMPT = "кот-космонавт в неоновом лесу";

  const dismissHint = useCallback(() => {
    if (hintClosing || hintDismissal.dismissed) return;
    setHintClosing(true);
    setTimeout(() => hintDismissal.dismiss(), 260);
  }, [hintClosing, hintDismissal]);

  const applyExample = () => {
    setPrompt(EXAMPLE_PROMPT);
    textareaRef.current?.focus();
    dismissHint();
  };

  return (
    <div className={cn("relative mb-2 mx-2 mt-0 sm:m-4", className)}>
      {/* Onboarding hint — floats just above the bar, arrow points down at it */}
      {showPromptHint && (
        <HintBubble
          arrow="bottom"
          positionClassName="left-1/2 -translate-x-1/2"
          positionStyle={{ bottom: "calc(100% + 6px)" }}
          width={320}
          closing={hintClosing}
          onDismiss={dismissHint}
        >
          <div className="font-semibold mb-1">Опишите идею</div>
          <div className="text-[12px] text-white/80 mb-2">
            Попробуйте — нажмите, чтобы подставить:
          </div>
          <button
            type="button"
            onClick={applyExample}
            title="Вставить в поле промпта"
            className="inline-flex items-center gap-2 text-[12.5px] leading-snug text-left px-2.5 py-1.5 rounded-md font-mono transition-colors text-white"
            style={{
              background: "rgba(255, 255, 255, 0.18)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.28)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.18)";
            }}
          >
            <span>{EXAMPLE_PROMPT}</span>
            <ClipboardCopy className="w-3.5 h-3.5 shrink-0 opacity-80" />
          </button>
        </HintBubble>
      )}

      {/* PromptBar */}
      <div className="relative flex flex-col rounded-b-xl sm:rounded-xl bg-card shadow-lg shadow-black/20 border border-border">
        <div className="flex items-start gap-3 p-3 px-4">
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
                    "border border-border bg-secondary hover:bg-secondary/80 hover:border-primary/50",
                    "transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                  aria-label="Добавить изображение"
                >
                  <ImagePlus className="h-5 w-5 text-primary" />
                </button>
              </ModeSelector>
            ) : // Simple format (array)
            imageInputs.length === 1 ? (
              <button
                type="button"
                onClick={() => handleOpenSelector(imageInputs[0].key)}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  "border border-border bg-secondary hover:bg-secondary/80 hover:border-primary/50",
                  "transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                )}
                aria-label="Добавить изображение"
              >
                <ImagePlus className="h-5 w-5 text-primary" />
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      "border border-border bg-secondary hover:bg-secondary/80 hover:border-primary/50",
                      "transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                    )}
                    aria-label="Добавить изображение"
                  >
                    <ImagePlus className="h-5 w-5 text-primary" />
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
              placeholder="Опишите идею..."
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

          {/* Кнопка Создать.
              Desktop — «Создать │ К 4.5». Mobile — компакт: «↑ К 4.5» без слова,
              чтобы освободить ширину под textarea. */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate() || isGenerating || isEstimateLoading || !!estimateError || !canAfford}
              className={cn(
                "inline-flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 rounded-lg text-sm font-semibold text-white",
                "px-3 sm:px-5",
                "bg-gradient-to-r from-primary to-[oklch(0.72_0.17_281)] shadow-md shadow-primary/30",
                "hover:shadow-lg hover:shadow-primary/40 hover:brightness-110",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100"
              )}
              aria-label="Создать"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4 sm:hidden" strokeWidth={2.5} />
              )}
              <span className="hidden sm:inline">Создать</span>
              {!isGenerating && estimateCost && parseFloat(estimateCost) > 0 && (
                <span className="inline-flex items-center gap-1 sm:pl-2 sm:border-l sm:border-white/25 text-xs font-medium">
                  <KadrIcon size="sm" />
                  {formatCurrency(estimateCost)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Footer — prompt-enhance toggle */}
        <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2">
          <PromptEnhanceToggle variant="inline" />
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
