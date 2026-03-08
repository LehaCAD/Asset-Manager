"use client";

import { useEffect } from "react";
import { useGenerationStore } from "@/lib/store/generation";
import { ModelSelector } from "@/components/generation/ModelSelector";
import { ParametersForm } from "@/components/generation/ParametersForm";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

  const hasParameters = selectedModel && selectedModel.parameters_schema.length > 0;

  return (
    <div
      className={cn(
        "relative flex flex-col border-r bg-background transition-all duration-200",
        configPanelOpen ? "w-72" : "w-12",
        className
      )}
    >
      {/* Collapse toggle */}
      <div className="flex items-center justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleConfigPanel}
          className="h-8 w-8"
          title={configPanelOpen ? "Свернуть" : "Развернуть"}
        >
          {configPanelOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {configPanelOpen && (
        <div className="flex flex-1 flex-col gap-4 p-4">
          {/* Model selector trigger */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Модель</label>
            <button
              onClick={openModelSelector}
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
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
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>

          {/* Parameters form */}
          {hasParameters && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Параметры</h3>
                <ParametersForm
                  schema={selectedModel.parameters_schema}
                  values={parameters}
                  onChange={setParameter}
                />
              </div>
            </>
          )}
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
