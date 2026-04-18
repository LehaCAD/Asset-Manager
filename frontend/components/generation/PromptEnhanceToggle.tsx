"use client";

import { useGenerationStore } from "@/lib/store/generation";
import { useFeatureGate } from "@/lib/hooks/useFeatureGate";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { TierBadge } from "@/components/subscription/TierBadge";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "standalone" | "inline";
}

export function PromptEnhanceToggle({ variant = "standalone" }: Props) {
  const enhancePrompt = useGenerationStore((s) => s.enhancePrompt);
  const setEnhancePrompt = useGenerationStore((s) => s.setEnhancePrompt);
  const gate = useFeatureGate("ai_prompt");

  const wrapperClass =
    variant === "inline"
      ? "flex items-center gap-2 cursor-pointer select-none"
      : "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 cursor-pointer hover:bg-accent transition-colors";

  if (gate.isLocked) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={gate.openUpgrade}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gate.openUpgrade(); } }}
          className={cn(wrapperClass, variant === "inline" ? "hover:opacity-80" : undefined)}
        >
          <Checkbox disabled checked={false} className="h-3.5 w-3.5 border-foreground/40" />
          <span className="text-xs text-foreground">Усилить промпт</span>
          <TierBadge tier={gate.tier} />
        </div>
        <UpgradeModal
          featureCode="ai_prompt"
          open={gate.upgradeOpen}
          onOpenChange={gate.setUpgradeOpen}
        />
      </>
    );
  }

  return (
    <TooltipProvider>
      <label className={cn(wrapperClass, variant === "inline" ? "hover:opacity-80" : undefined)}>
        <Checkbox
          checked={enhancePrompt}
          onCheckedChange={(checked) => setEnhancePrompt(checked === true)}
          className="h-3.5 w-3.5 border-foreground/50"
        />
        <span className="text-xs text-foreground">Усилить промпт</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Промпт будет автоматически дополнен и улучшен для лучшего результата генерации.</p>
          </TooltipContent>
        </Tooltip>
      </label>
    </TooltipProvider>
  );
}
