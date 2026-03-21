"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatStorage, formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Copy, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { elementsApi } from "@/lib/api/elements";
import type { Element } from "@/lib/types";

interface DetailPanelProps {
  element: Element;
  onUpdateElement?: (id: number, updates: Partial<Element>) => void;
}

const sourceLabels: Record<string, string> = {
  GENERATED: "Генерация",
  UPLOADED: "Загрузка",
  IMG2VID: "Из изображения",
};

export function DetailPanel({ element, onUpdateElement }: DetailPanelProps) {
  const [promptText, setPromptText] = useState(element.prompt_text ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Sync prompt text when element changes
  useEffect(() => {
    setPromptText(element.prompt_text ?? "");
  }, [element.id, element.prompt_text]);

  const hasPromptChanged = promptText !== (element.prompt_text ?? "");

  const metadata = [
    ...(element.ai_model_name ? [{ label: "Модель", value: element.ai_model_name }] : []),
    ...(element.generation_cost ? [{ label: "Стоимость", value: formatCurrency(element.generation_cost) }] : []),
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

      {/* Prompt Section */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Промпт</h3>
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

      {/* Comments Placeholder */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Комментарии</h3>
        <Separator className="mb-3" />
        <Textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          rows={3}
          className="text-sm resize-none bg-muted/50"
          placeholder="Здесь будут комментарии..."
          disabled
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Функция комментариев в разработке
        </p>
      </div>

    </div>
  );
}
