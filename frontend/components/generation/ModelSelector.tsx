"use client";

import { useState, useEffect, useRef } from "react";
import { ModelCard } from "@/components/generation/ModelCard";
import { cn } from "@/lib/utils";
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
        "absolute left-full top-0 z-50 w-72",
        "bg-background shadow-2xl rounded-lg",
        "flex flex-col"
      )}
      style={{ maxHeight: 'calc(100vh - 280px)' }}
    >
      {/* Header */}
      <div className="flex items-center p-3 shrink-0">
        <h2 className="text-base font-semibold text-foreground">Модели</h2>
      </div>

      {/* Tabs */}
      <div className="px-3 pb-2 shrink-0">
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md">
          <button
            onClick={() => setActiveTab("IMAGE")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors",
              activeTab === "IMAGE" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Изображение
          </button>
          <button
            onClick={() => setActiveTab("VIDEO")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors",
              activeTab === "VIDEO" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Видео
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div 
        className="flex-1 overflow-y-auto px-3 pb-3 py-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--muted-foreground)) transparent' }}
      >
        <div className="space-y-2">
          {filteredModels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
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
