"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatStorage, formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/utils/logger";
import { Copy, Check, Save, RotateCcw, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { elementsApi } from "@/lib/api/elements";
import { sharingApi } from "@/lib/api/sharing";
import { useGenerationStore } from "@/lib/store/generation";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { useAuthStore } from "@/lib/store/auth";
import { TierBadge } from "@/components/subscription/TierBadge";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { CommentThread } from "@/components/sharing/CommentThread";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { Element, Comment, PublicElementReaction } from "@/lib/types";

interface DetailPanelProps {
  element: Element;
  onUpdateElement?: (id: number, updates: Partial<Element>) => void;
  onClose?: () => void;
}

const sourceLabels: Record<string, string> = {
  GENERATED: "Генерация",
  UPLOADED: "Загрузка",
};

/** Keys in generation_config that are system metadata, not user params */
const HIDDEN_CONFIG_KEYS = new Set(["_debit_amount", "_debit_transaction", "input_urls"]);

/** Extract image URLs from generation_config. URLs stored under variable key names as arrays or strings. */
function extractInputImageUrls(config: Record<string, unknown> | null | undefined): string[] {
  if (!config) return [];
  const urls: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith("_")) continue; // skip internal keys (_debit_amount, _debit_transaction)
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.startsWith("http")) urls.push(item);
      }
    } else if (typeof value === "string" && value.startsWith("http")) {
      urls.push(value);
    }
  }
  return urls;
}

/** 40x40 thumbnail with error fallback via React state. */
function InputImageThumbnail({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Исходное ${index + 1}`}
      className="w-10 h-10 rounded-md object-cover bg-muted"
      onError={() => setFailed(true)}
    />
  );
}

export function DetailPanel({ element, onUpdateElement, onClose }: DetailPanelProps) {
  // Display enhanced prompt if available, otherwise original
  const getDisplayPrompt = (el: Element) => {
    const enhanced = el.generation_config?.["_prompt_enhanced"] === true;
    if (enhanced) {
      return (el.generation_config?.["_enhanced_prompt"] as string) ?? el.prompt_text ?? "";
    }
    return el.prompt_text ?? "";
  };

  const [promptText, setPromptText] = useState(getDisplayPrompt(element));
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<PublicElementReaction[]>([]);
  const [reviews, setReviews] = useState<Array<{ session_id: string; author_name: string; action: string }>>([]);

  const { retryFromElement, availableModels } = useGenerationStore();
  const quota = useAuthStore((s) => s.user?.quota);
  const [storageUpgradeOpen, setStorageUpgradeOpen] = useState(false);

  const isStorageFull = quota
    ? quota.storage_limit_bytes > 0 && quota.storage_used_bytes >= quota.storage_limit_bytes
    : false;

  // Sync prompt text when element changes
  useEffect(() => {
    setPromptText(getDisplayPrompt(element));
  }, [element.id, element.prompt_text]);

  // Fetch comments and reactions when element changes
  useEffect(() => {
    let cancelled = false;
    sharingApi.getElementComments(element.id).then((data) => {
      if (!cancelled) setComments(data);
    }).catch((err) => logger.warn("detail_panel.fetch_comments_failed", { elementId: element.id, cause: err }));
    sharingApi.getElementReactions(element.id).then((data) => {
      if (!cancelled) setReactions(data);
    }).catch((err) => logger.warn("detail_panel.fetch_reactions_failed", { elementId: element.id, cause: err }));
    sharingApi.getElementReviews(element.id).then((data) => {
      if (!cancelled) setReviews(data);
    }).catch((err) => logger.warn("detail_panel.fetch_reviews_failed", { elementId: element.id, cause: err }));
    return () => { cancelled = true; };
  }, [element.id]);

  const hasPromptChanged = promptText !== getDisplayPrompt(element);
  const isGenerated = element.source_type === "GENERATED";

  // Build label + value label maps from model's parameters_schema
  const { labelMap, valueLabelMap } = useMemo(() => {
    const model = availableModels.find((m) => m.id === element.ai_model);
    if (!model?.parameters_schema) return { labelMap: {}, valueLabelMap: {} };
    const lMap: Record<string, string> = {};
    const vMap: Record<string, Record<string, string>> = {};
    for (const param of model.parameters_schema) {
      lMap[param.request_key] = param.label;
      const allOptions = [
        ...(param.options ?? []),
        ...(param.featured_options ?? []),
        ...(param.overflow_options ?? []),
      ];
      if (allOptions.length > 0) {
        vMap[param.request_key] = {};
        for (const opt of allOptions) {
          vMap[param.request_key][String(opt.value)] = opt.label;
        }
      }
    }
    return { labelMap: lMap, valueLabelMap: vMap };
  }, [availableModels, element.ai_model]);

  // Filter generation_config to user-visible params
  const configParams = useMemo(() => {
    if (!element.generation_config || !isGenerated) return [];
    return Object.entries(element.generation_config)
      .filter(([key]) => !HIDDEN_CONFIG_KEYS.has(key) && !key.startsWith("_"))
      .filter(([, value]) => {
        if (typeof value === "string" && value.startsWith("http")) return false;
        if (Array.isArray(value)) return false;
        return true;
      })
      .map(([key, value]) => {
        const raw = String(value);
        const displayValue = valueLabelMap[key]?.[raw]
          ?? (raw === "true" ? "Да" : raw === "false" ? "Нет" : raw);
        return { key, label: labelMap[key] || key, value: displayValue };
      });
  }, [element.generation_config, isGenerated, labelMap]);

  // Cost from generation_config
  const generationCost = element.generation_cost
    ?? (element.generation_config?.["_debit_amount"] as string | undefined);

  // Prompt enhancement info
  const enhanceCost = element.generation_config?.["_enhance_cost"] as string | undefined;
  const wasEnhanced = element.generation_config?.["_prompt_enhanced"] === true;

  const metadata = [
    ...(element.ai_model_name ? [{ label: "Модель", value: element.ai_model_name }] : []),
    ...(generationCost ? [{ label: "Стоимость", value: formatCurrency(generationCost) }] : []),
    ...(enhanceCost ? [{ label: "Усиление промпта", value: formatCurrency(enhanceCost) }] : []),
    ...(element.file_size ? [{ label: "Размер", value: formatStorage(element.file_size) }] : []),
    ...(element.seed ? [{ label: "Seed", value: String(element.seed) }] : []),
    { label: "Создан", value: formatDate(element.created_at) },
    { label: "Источник", value: sourceLabels[element.source_type] ?? element.source_type },
    { label: "Тип", value: element.element_type === "IMAGE" ? "Изображение" : "Видео" },
  ];

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const handleSavePrompt = async () => {
    if (!hasPromptChanged) return;
    setIsSaving(true);
    try {
      await elementsApi.update(element.id, { prompt_text: promptText });
      onUpdateElement?.(element.id, { prompt_text: promptText });
      toast.success("Промпт сохранён");
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRepeat = () => {
    if (isStorageFull) {
      setStorageUpgradeOpen(true);
      return;
    }
    retryFromElement(element);
    useOnboardingStore.getState().completeTask('retry_generation');
  };

  const handleCommentSubmit = async (text: string, parentId?: number) => {
    await sharingApi.addElementComment(element.id, text, parentId);
    const updated = await sharingApi.getElementComments(element.id);
    setComments(updated);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Metadata Section */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Информация</h3>
        <Separator className="mb-3" />
        <dl className="space-y-2 text-sm">
          {metadata.map((item) => (
            <div key={item.label} className="flex justify-between">
              <dt className="text-muted-foreground">{item.label}:</dt>
              <dd className="font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Generation Parameters - only for generated elements */}
      {isGenerated && configParams.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Параметры</h3>
          <Separator className="mb-3" />
          <dl className="space-y-1.5 text-sm">
            {configParams.map(({ key, label, value }) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-muted-foreground truncate">{label}:</dt>
                <dd className="font-medium text-right truncate max-w-[140px]" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Error Section - for failed elements */}
      {element.status === "FAILED" && element.error_message && (
        <div>
          <h3 className="text-sm font-medium text-destructive mb-2">Ошибка</h3>
          <Separator className="mb-3" />
          <p className="text-sm text-muted-foreground">{element.error_message}</p>
        </div>
      )}

        {/* Исходные изображения */}
        {(() => {
          const inputUrls = extractInputImageUrls(element.generation_config);
          if (inputUrls.length === 0) return null;
          return (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Исходные изображения
                </h4>
                <div className="flex flex-wrap gap-2">
                  {inputUrls.map((url, i) => (
                    <InputImageThumbnail key={url} url={url} index={i} />
                  ))}
                </div>
              </div>
            </>
          );
        })()}

      {/* Prompt Section */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Промпт</h3>
          {wasEnhanced && (
            <span className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded mb-2">
              ✦ Усилен
            </span>
          )}
        </div>
        <Separator className="mb-3" />
        <div className="space-y-2">
          <Textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            placeholder="Нет промпта"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPrompt}
              className="flex-1"
            >
              {isCopied ? (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isCopied ? "Скопировано" : "Копировать"}
            </Button>
            {hasPromptChanged && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSavePrompt}
                disabled={isSaving}
                className="flex-1"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Сохранить
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Repeat button - only for generated elements */}
      {isGenerated && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRepeat}
            className="w-full"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Повторить запрос
            {isStorageFull && <TierBadge tier="plus" className="ml-1.5" />}
          </Button>
          <UpgradeModal
            open={storageUpgradeOpen}
            onOpenChange={setStorageUpgradeOpen}
            limitTitle="Хранилище"
            limitUsed={quota?.storage_used_bytes}
            limitMax={quota?.storage_limit_bytes}
          />
        </div>
      )}

      {/* Reactions from reviewers */}
      {reactions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Реакции</h3>
          <Separator className="mb-3" />
          {/* Summary */}
          <div className="flex items-center gap-3 mb-2 text-sm">
            {reactions.filter(r => r.value === 'like').length > 0 && (
              <span className="flex items-center gap-1 text-emerald-500 font-medium">
                <ThumbsUp className="h-4 w-4" />
                {reactions.filter(r => r.value === 'like').length}
              </span>
            )}
            {reactions.filter(r => r.value === 'dislike').length > 0 && (
              <span className="flex items-center gap-1 text-orange-500 font-medium">
                <ThumbsDown className="h-4 w-4" />
                {reactions.filter(r => r.value === 'dislike').length}
              </span>
            )}
          </div>
          {/* Individual reactions */}
          <div className="flex flex-wrap gap-1.5">
            {reactions.map((r, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                  r.value === 'like'
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-orange-500/10 text-orange-500'
                )}
              >
                {r.value === 'like' ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />} {r.author_name || 'Гость'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Review decisions from reviewers */}
      {reviews.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Согласование</h3>
          <Separator className="mb-3" />
          <div className="flex flex-wrap gap-1.5">
            {reviews.map((r, i) => {
              const icon = r.action === 'approved' ? '✓' : r.action === 'changes_requested' ? '↻' : '✕'
              const label = r.action === 'approved' ? 'Согласовано' : r.action === 'changes_requested' ? 'На доработку' : 'Отклонено'
              const colorClass = r.action === 'approved'
                ? 'bg-emerald-500/10 text-emerald-500'
                : r.action === 'changes_requested'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'bg-red-500/10 text-red-400'
              return (
                <span key={i} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs', colorClass)}>
                  {icon} {r.author_name || 'Гость'} — {label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Комментарии</h3>
        <Separator className="mb-3" />
        <CommentThread
          comments={comments}
          onSubmit={handleCommentSubmit}
          isAuthenticated={true}
        />
      </div>
    </div>
  );
}
