"use client";

import { useEffect } from "react";
import { useGenerationStore } from "@/lib/store/generation";
import { useCreditsStore } from "@/lib/store/credits";
import { ModelSelector } from "@/components/generation/ModelSelector";
import { ParametersForm } from "@/components/generation/ParametersForm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeft, ChevronRight, AlertCircle } from "lucide-react";
import { ChargeIcon } from "@/components/ui/charge-icon";

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
  
  const estimateCost = useCreditsStore((s) => s.estimateCost);
  const estimateError = useCreditsStore((s) => s.estimateError);
  const canAfford = useCreditsStore((s) => s.canAfford);
  const isEstimateLoading = useCreditsStore((s) => s.isEstimateLoading);

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

  const hasParameters = !!selectedModel?.parameters_schema.some(
    (param) => param.visible !== false
  );

  return (
    <div
      className={cn(
        "relative flex flex-col border-r bg-surface transition-all duration-200 h-full",
        configPanelOpen ? "w-72" : "w-12",
        className
      )}
    >
      {configPanelOpen && (
        <div className="flex flex-1 flex-col gap-0 p-4 overflow-y-auto">
          {/* Model selector trigger - header with collapse button */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-semibold">Модель</label>
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
                "bg-card hover:bg-card/80 border border-border",
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

          {/* Parameters form */}
          {hasParameters && (
            <div className="mt-3">
              <ParametersForm
                schema={selectedModel?.parameters_schema ?? []}
                values={parameters}
                onChange={setParameter}
              />
            </div>
          )}

          {/* Стоимость генерации */}
          {selectedModel && (
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[13px] font-semibold">Стоимость</span>
                {isEstimateLoading ? (
                  <span className="text-muted-foreground">...</span>
                ) : estimateError && !estimateCost ? (
                  <span className="flex items-center gap-1 text-warning">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs">Ошибка</span>
                  </span>
                ) : estimateCost ? (
                  <span className={cn(
                    "font-medium flex items-center gap-1",
                    canAfford ? "text-success" : "text-destructive"
                  )}>
                    <ChargeIcon size="sm" />
                    {(() => {
                      const n = parseFloat(estimateCost);
                      return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
                    })()}
                  </span>
                ) : null}
              </div>
              {estimateError && !estimateCost && (
                <p className="text-xs text-warning">{estimateError}</p>
              )}
              {!isEstimateLoading && estimateCost && !canAfford && (
                <p className="text-xs text-destructive">Недостаточно средств</p>
              )}
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
