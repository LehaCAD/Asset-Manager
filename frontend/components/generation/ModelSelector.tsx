"use client";

import { useState } from "react";
import { ModelCard } from "@/components/generation/ModelCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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

  const filteredModels = models.filter((model) => model.model_type === activeTab);

  const handleSelect = (model: AIModel) => {
    onSelectModel(model);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div
        className={cn(
          "absolute left-full top-0 z-40 h-full w-80 border-r bg-background shadow-xl",
          "flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Модели</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="px-4 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="IMAGE">Изображение</TabsTrigger>
              <TabsTrigger value="VIDEO">Видео</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="IMAGE" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(100vh-140px)]">
              <div className="p-4 space-y-3">
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
            </ScrollArea>
          </TabsContent>

          <TabsContent value="VIDEO" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(100vh-140px)]">
              <div className="p-4 space-y-3">
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
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
