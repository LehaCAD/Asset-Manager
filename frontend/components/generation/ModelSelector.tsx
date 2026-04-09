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

  const selectedModel = models.find(m => m.id === selectedModelId) ?? null;

  // Build display items: one entry per family or standalone model
  type DisplayItem = {
      type: 'family';
      familyId: number;
      name: string;
      preview_url: string;
      description: string;
      tags: string[];
      defaultVariant: AIModel;
      isSelected: boolean;
  } | {
      type: 'standalone';
      model: AIModel;
      isSelected: boolean;
  };

  const displayItems: DisplayItem[] = (() => {
      const familiesSeen = new Map<number, DisplayItem>();
      const items: DisplayItem[] = [];

      for (const model of filteredModels) {
          if (model.family) {
              if (!familiesSeen.has(model.family.id)) {
                  const item: DisplayItem = {
                      type: 'family',
                      familyId: model.family.id,
                      name: model.family.name,
                      preview_url: model.family.preview_url,
                      description: model.family.description,
                      tags: model.family.tags,
                      defaultVariant: model,
                      isSelected: selectedModelId != null && model.family.id === selectedModel?.family?.id,
                  };
                  familiesSeen.set(model.family.id, item);
                  items.push(item);
              }
              // Update default variant if found
              const existing = familiesSeen.get(model.family.id)!;
              if (existing.type === 'family' && model.is_default_variant) {
                  existing.defaultVariant = model;
              }
              // Update isSelected
              if (existing.type === 'family' && model.id === selectedModelId) {
                  existing.isSelected = true;
              }
          } else {
              items.push({
                  type: 'standalone',
                  model,
                  isSelected: model.id === selectedModelId,
              });
          }
      }

      return items;
  })();

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
            displayItems.map(item => {
              if (item.type === 'family') {
                return (
                  <ModelCard
                    key={`family-${item.familyId}`}
                    model={{
                      ...item.defaultVariant,
                      name: item.name,
                      preview_url: item.preview_url,
                      description: item.description,
                      tags: item.tags,
                    }}
                    isSelected={item.isSelected}
                    onSelect={() => handleSelect(item.defaultVariant)}
                  />
                );
              }
              return (
                <ModelCard
                  key={item.model.id}
                  model={item.model}
                  isSelected={item.isSelected}
                  onSelect={() => handleSelect(item.model)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
