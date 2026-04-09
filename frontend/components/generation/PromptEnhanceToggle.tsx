"use client";

import { useState } from "react";
import { useGenerationStore } from "@/lib/store/generation";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { ProBadge } from "@/components/subscription/ProBadge";
import { Info } from "lucide-react";

export function PromptEnhanceToggle() {
  const enhancePrompt = useGenerationStore((s) => s.enhancePrompt);
  const setEnhancePrompt = useGenerationStore((s) => s.setEnhancePrompt);
  const hasFeature = useSubscriptionStore((s) => s.hasFeature("ai_prompt"));
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!hasFeature) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowUpgrade(true)}
          className="flex items-center gap-1.5 opacity-50 cursor-pointer"
        >
          <Checkbox disabled checked={false} className="h-3.5 w-3.5" />
          <span className="text-xs text-muted-foreground">Усилить промпт</span>
          <ProBadge />
        </button>
        <UpgradeModal
          featureCode="ai_prompt"
          open={showUpgrade}
          onOpenChange={setShowUpgrade}
        />
      </>
    );
  }

  return (
    <TooltipProvider>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <Checkbox
          checked={enhancePrompt}
          onCheckedChange={(checked) => setEnhancePrompt(checked === true)}
          className="h-3.5 w-3.5"
        />
        <span className="text-xs text-muted-foreground">Усилить промпт</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Промпт будет автоматически дополнен и улучшен для лучшего результата генерации.</p>
          </TooltipContent>
        </Tooltip>
      </label>
    </TooltipProvider>
  );
}
