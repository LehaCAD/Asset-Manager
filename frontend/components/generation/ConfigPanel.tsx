"use client";

import { useCallback, useEffect, useState } from "react";
import { useGenerationStore } from "@/lib/store/generation";
import { useCreditsStore } from "@/lib/store/credits";
import { ModelSelector } from "@/components/generation/ModelSelector";
import { ParametersForm } from "@/components/generation/ParametersForm";
import { VariantSwitcher } from "@/components/generation/VariantSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeft, ChevronRight, AlertCircle } from "lucide-react";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { useHintDismissal } from "@/lib/hooks/useHintDismissal";
import { HintBubble } from "@/components/onboarding/HintBubble";

interface ConfigPanelProps {
  className?: string;
  /** Force the panel into expanded mode regardless of store state.
   *  Used by the mobile top-sheet where collapsing to 48 px is meaningless. */
  forceOpen?: boolean;
  /** Hide the collapse-to-sidebar button (irrelevant on mobile). */
  hideCollapseButton?: boolean;
}

export function ConfigPanel({ className, forceOpen = false, hideCollapseButton = false }: ConfigPanelProps) {
  const {
    availableModels,
    selectedModel,
    parameters,
    configPanelOpen: storeConfigPanelOpen,
    modelSelectorOpen,
    loadModels,
    selectModel,
    setParameter,
    toggleConfigPanel,
    openModelSelector,
    closeModelSelector,
    familyVariants,
  } = useGenerationStore();

  const configPanelOpen = forceOpen || storeConfigPanelOpen;
  
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

  const variants = familyVariants();
  const showVariantSwitcher = variants.length >= 2 && selectedModel?.family != null;

  // Onboarding hint: show when first_generation task not done, panel is open, and not manually dismissed.
  // Gate on `isLoaded` to avoid flashing the hint for old accounts while tasks hydrate.
  const onboardingTasks = useOnboardingStore((s) => s.tasks);
  const onboardingLoaded = useOnboardingStore((s) => s.isLoaded);
  const firstGenDone = onboardingTasks.find((t) => t.code === "first_generation")?.completed;
  const hintDismissal = useHintDismissal("config-panel");
  const [hintClosing, setHintClosing] = useState(false);
  const showConfigHint =
    onboardingLoaded && !firstGenDone && configPanelOpen && hintDismissal.hydrated && !hintDismissal.dismissed;

  const dismissHint = useCallback(() => {
    if (hintClosing || hintDismissal.dismissed) return;
    setHintClosing(true);
    setTimeout(() => hintDismissal.dismiss(), 260);
  }, [hintClosing, hintDismissal]);

  // Clicking ANY interactive control inside the panel dismisses the hint
  const handlePanelInteract = (e: React.MouseEvent) => {
    if (!showConfigHint) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, [role='button'], input, select, a")) {
      dismissHint();
    }
  };

  return (
    <div
      onClick={handlePanelInteract}
      className={cn(
        "relative z-[51] flex flex-col border-r bg-surface transition-all duration-200 h-full",
        configPanelOpen ? "w-72" : "w-12",
        className
      )}
    >
      {configPanelOpen && (
        <div className="flex flex-1 flex-col gap-0 p-4 overflow-y-auto">
          {/* Model selector trigger - header with collapse button */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Модель</label>
              {!hideCollapseButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleConfigPanel}
                  className="h-7 w-7"
                  title="Свернуть"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              )}
            </div>
            <button
              onClick={handleModelClick}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                "bg-card hover:bg-card/80 border border-border",
                modelSelectorOpen && "ring-2 ring-primary bg-primary/5"
              )}
            >
              {selectedModel?.preview_url ? (
                <img
                  src={selectedModel.preview_url.startsWith("http") ? selectedModel.preview_url : `/images/models/${selectedModel.preview_url}.png`}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover"
                />
              ) : (
                <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05]">
                  <div className="h-4 w-4 rounded-sm bg-muted-foreground/20" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {selectedModel?.name ?? "Выберите модель"}
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

          {showVariantSwitcher && selectedModel?.family && (
            <VariantSwitcher
              variants={variants}
              currentId={selectedModel.id}
              uiControl={selectedModel.family.variant_ui_control}
              onSelect={selectModel}
            />
          )}

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
            <div className="mt-4 rounded-lg border border-border bg-background/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Стоимость</span>
                <span className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  estimateError && !estimateCost && !isEstimateLoading
                    ? "text-muted-foreground"
                    : !isEstimateLoading && !canAfford
                      ? "text-destructive"
                      : "text-foreground"
                )}>
                  <KadrIcon size="sm" />
                  {isEstimateLoading ? (
                    <span className="w-5 h-3 rounded bg-muted animate-pulse inline-block" />
                  ) : estimateError && !estimateCost ? (
                    "—"
                  ) : estimateCost ? (
                    (() => {
                      const n = parseFloat(estimateCost);
                      return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
                    })()
                  ) : (
                    "..."
                  )}
                </span>
              </div>
              {estimateError && !estimateCost && (
                <p className="text-[11px] text-muted-foreground">{estimateError}</p>
              )}
              {!isEstimateLoading && estimateCost && !canAfford && (
                <p className="text-[11px] text-destructive">Недостаточно средств</p>
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

      {/* Onboarding hint — desktop only; mobile has labelled «Выбрать модель» button which is self-explanatory */}
      {showConfigHint && (
        <HintBubble
          arrow="left"
          positionClassName="hidden md:block"
          positionStyle={{
            top: "calc(50% - 160px)",
            left: "calc(100% + 14px)",
          }}
          width={280}
          closing={hintClosing}
          onDismiss={dismissHint}
        >
          <div className="font-semibold mb-0.5">Выберите модель</div>
          <div className="text-white/85 text-[12.5px]">
            Здесь настраивается модель генерации и её параметры.
          </div>
        </HintBubble>
      )}
    </div>
  );
}
