"use client";

import { useState, useEffect, useRef } from "react";
import { ModelCard } from "@/components/generation/ModelCard";
import { cn } from "@/lib/utils";
import { X, Image as ImageIcon, SquarePlay } from "lucide-react";
import type { AIModel } from "@/lib/types";

interface ModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  models: AIModel[];
  selectedModelId: number | null;
  onSelectModel: (model: AIModel) => void;
}

export function ModelSelector({
  isOpen,
  onClose,
  models,
  selectedModelId,
  onSelectModel,
}: ModelSelectorProps) {
  const [activeTab, setActiveTab] = useState<string>("IMAGE");
  const panelRef = useRef<HTMLDivElement>(null);

  const filteredModels = models.filter((model) => model.model_type === activeTab);

  const handleSelect = (model: AIModel) => {
    onSelectModel(model);
  };

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute left-full top-0 z-50 w-[440px]",
        "rounded-lg bg-popover shadow-lg",
        "border border-border",
        "flex flex-col"
      )}
      style={{ maxHeight: 'calc(100vh - 280px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <span className="text-[14px] font-semibold text-popover-foreground">Выбор модели</span>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 px-4 shrink-0 border-b border-border">
        <button
          onClick={() => setActiveTab("IMAGE")}
          className={cn(
            "flex items-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors",
            activeTab === "IMAGE"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ImageIcon size={13} />
          Изображения
        </button>
        <button
          onClick={() => setActiveTab("VIDEO")}
          className={cn(
            "flex items-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors",
            activeTab === "VIDEO"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SquarePlay size={13} />
          Видео
        </button>
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto p-1.5"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="flex flex-col gap-1">
          {filteredModels.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Нет доступных моделей
            </p>
          ) : (
            filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isSelected={model.id === selectedModelId}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
