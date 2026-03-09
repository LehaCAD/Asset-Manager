"use client";

import { useEffect } from "react";
import { useGenerationStore } from "@/lib/store/generation";
import { ModelSelector } from "@/components/generation/ModelSelector";
import { ParametersForm } from "@/components/generation/ParametersForm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeft, ChevronRight } from "lucide-react";

interface ConfigPanelProps {
  className?: string;
}

export function ConfigPanel({ className }: ConfigPanelProps) {
  const {
    availableModels,
    selectedModel,
    parameters,
    configPanelOpen,
    modelSelectorOpen,
    loadModels,
    selectModel,
    setParameter,
    toggleConfigPanel,
    openModelSelector,
    closeModelSelector,
  } = useGenerationStore();

  // Load models on mount if not loaded
  useEffect(() => {
    if (availableModels.length === 0) {
      loadModels();
    }
  }, [availableModels.length, loadModels]);

  const handleSelectModel = (model: typeof selectedModel) => {
    if (model) {
      selectModel(model);
    }
  };

  // Toggle model selector on click
  const handleModelClick = () => {
    if (modelSelectorOpen) {
      closeModelSelector();
    } else {
      openModelSelector();
    }
  };

  const hasParameters = selectedModel && selectedModel.parameters_schema.length > 0;

  return (
    <div
      className={cn(
        "relative flex flex-col border-r bg-background transition-all duration-200 h-full",
        configPanelOpen ? "w-72" : "w-12",
        className
      )}
    >
      {configPanelOpen && (
        <div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
          {/* Model selector trigger - header with collapse button */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium px-1">Модель</label>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleConfigPanel}
                className="h-7 w-7"
                title="Свернуть"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <button
              onClick={handleModelClick}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                "bg-muted/50 hover:bg-muted border-0",
                modelSelectorOpen && "ring-2 ring-primary bg-primary/5"
              )}
            >
              {selectedModel?.preview_url && (
                <img
                  src={selectedModel.preview_url}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {selectedModel?.name ?? "Выберите модель"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedModel?.description}
                </p>
              </div>
              <ChevronRight 
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                  modelSelectorOpen && "rotate-90"
                )} 
              />
            </button>
          </div>

          {/* Parameters form - card style */}
          {hasParameters && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-4">
              <h3 className="text-sm font-medium px-1">Параметры</h3>
              <ParametersForm
                schema={selectedModel.parameters_schema}
                values={parameters}
                onChange={setParameter}
              />
            </div>
          )}
        </div>
      )}

      {/* Collapsed state - expand button */}
      {!configPanelOpen && (
        <div className="flex flex-col items-center p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleConfigPanel}
            className="h-8 w-8"
            title="Развернуть"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Model selector slide-out panel */}
      <ModelSelector
        isOpen={modelSelectorOpen}
        onClose={closeModelSelector}
        models={availableModels}
        selectedModelId={selectedModel?.id ?? null}
        onSelectModel={handleSelectModel}
      />
    </div>
  );
}
