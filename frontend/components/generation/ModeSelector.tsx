"use client";

import { useMemo } from "react";
import { X, Check, Lock } from "lucide-react";
import Image from "next/image";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ImageInputGroup, ImageInputSchemaItem } from "@/lib/types";
import type { ImageInput } from "@/lib/store/generation";

import * as LucideIcons from "lucide-react";

function getLucideIcon(name?: string) {
  if (!name) return null;
  const pascalName = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const Icon = (LucideIcons as Record<string, unknown>)[pascalName];
  if (typeof Icon === "function") return Icon as React.ComponentType<{ className?: string; size?: number }>;
  return null;
}

type SlotState = "available" | "active" | "depends_locked" | "exclusive_locked";

interface SlotWithState {
  slot: ImageInputSchemaItem;
  group: ImageInputGroup;
  state: SlotState;
  fileCount: number;
  maxFiles: number;
  lockReason?: string;
}

interface ModeSelectorProps {
  groups: ImageInputGroup[];
  imageInputs: ImageInput[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSlot: (groupKey: string, slotKey: string) => void;
  children: React.ReactNode;
}

export function ModeSelector({
  groups,
  imageInputs,
  open,
  onOpenChange,
  onSelectSlot,
  children,
}: ModeSelectorProps) {
  const slots = useMemo(() => computeSlotStates(groups, imageInputs), [groups, imageInputs]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-[400px] rounded-lg border-border bg-popover p-0 shadow-lg"
      >
        <div className="flex items-center justify-between px-3.5 py-3">
          <span className="text-[15px] font-semibold tracking-tight text-popover-foreground">
            Выбор режима
          </span>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col gap-1 px-2 pb-2">
            {slots.map((item) => (
              <SlotCard
                key={`${item.group.key}-${item.slot.key}`}
                item={item}
                onSelect={() => {
                  if (item.state === "available" || item.state === "active") {
                    onSelectSlot(item.group.key, item.slot.key);
                    onOpenChange(false);
                  }
                }}
              />
            ))}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}

function computeSlotStates(
  groups: ImageInputGroup[],
  imageInputs: ImageInput[]
): SlotWithState[] {
  const activeGroupKeys = new Set<string>();
  for (const group of groups) {
    const groupSlotKeys = new Set(group.slots.map((s) => s.key));
    const hasFiles = imageInputs.some(
      (inp) => groupSlotKeys.has(inp.key) && inp.files.length > 0
    );
    if (hasFiles) activeGroupKeys.add(group.key);
  }

  const blockedGroupKeys = new Set<string>();
  for (const activeKey of activeGroupKeys) {
    const activeGroup = groups.find((g) => g.key === activeKey);
    if (activeGroup?.exclusive_with) {
      for (const excl of activeGroup.exclusive_with) {
        blockedGroupKeys.add(excl);
      }
    }
  }

  const activeGroupLabel = activeGroupKeys.size > 0
    ? groups.find((g) => activeGroupKeys.has(g.key))?.label || ""
    : "";

  const result: SlotWithState[] = [];

  for (const group of groups) {
    for (const slot of group.slots) {
      const input = imageInputs.find((i) => i.key === slot.key);
      const fileCount = input?.files.length ?? 0;

      if (blockedGroupKeys.has(group.key)) {
        result.push({
          slot, group, state: "exclusive_locked", fileCount: 0, maxFiles: slot.max,
          lockReason: `Несовместимо с режимом «${activeGroupLabel}»`,
        });
        continue;
      }

      if (slot.depends_on) {
        const parentInput = imageInputs.find((i) => i.key === slot.depends_on);
        if (!parentInput || parentInput.files.length === 0) {
          const parentSlot = group.slots.find((s) => s.key === slot.depends_on);
          result.push({
            slot, group, state: "depends_locked", fileCount: 0, maxFiles: slot.max,
            lockReason: `Сначала выберите «${parentSlot?.label || slot.depends_on}»`,
          });
          continue;
        }
      }

      result.push({
        slot, group, state: fileCount > 0 ? "active" : "available", fileCount, maxFiles: slot.max,
      });
    }
  }

  return result;
}

function SlotCard({
  item,
  onSelect,
}: {
  item: SlotWithState;
  onSelect: () => void;
}) {
  const { slot, state, fileCount, maxFiles, lockReason } = item;
  const illustrationSrc = slot.illustration
    ? `/images/modes/${slot.illustration}.png`
    : null;
  const FallbackIcon = getLucideIcon(slot.icon);

  const isLocked = state === "depends_locked" || state === "exclusive_locked";
  const isActive = state === "active";

  const card = (
    <button
      onClick={onSelect}
      disabled={isLocked}
      className={
        isLocked
          ? "relative flex w-full gap-3 rounded border border-border/30 bg-foreground/[0.03] p-1.5 text-left opacity-35 cursor-not-allowed"
          : isActive
          ? "group relative flex w-full gap-3 rounded border border-primary/30 bg-primary/[0.08] p-1.5 text-left transition-colors hover:bg-primary/[0.12]"
          : "group relative flex w-full gap-3 rounded border border-border/30 bg-foreground/[0.03] p-1.5 text-left transition-colors hover:bg-foreground/[0.06]"
      }
    >
      {/* Thumbnail */}
      <div className="relative flex h-[80px] w-[80px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/[0.05]">
        {illustrationSrc ? (
          <Image
            src={illustrationSrc}
            alt={slot.label}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : FallbackIcon ? (
          <FallbackIcon className="text-muted-foreground" size={26} />
        ) : (
          <div className="h-6 w-6 rounded-sm bg-muted-foreground/20" />
        )}

        {isActive && (
          <div className="absolute left-0 top-0 flex items-center gap-[3px] rounded-br-[3px] bg-primary px-1.5 py-[3px]">
            <Check size={9} strokeWidth={2.5} className="text-primary-foreground" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-primary-foreground">активно</span>
          </div>
        )}

        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Lock size={18} className="text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-1 flex-col justify-center gap-0.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className={isActive
            ? "text-[13px] font-medium text-foreground"
            : "text-[13px] font-medium text-foreground/75 group-hover:text-foreground"
          }>
            {slot.label}
          </span>
          {isActive && maxFiles > 1 && (
            <span className="text-[11px] font-medium italic leading-none tabular-nums text-muted-foreground">
              {fileCount}/{maxFiles}
            </span>
          )}
        </div>
        {slot.description && (
          <span className="text-[11px] leading-snug text-muted-foreground/70 group-hover:text-muted-foreground">
            {slot.description}
          </span>
        )}
      </div>
    </button>
  );

  if (isLocked && lockReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="right">
          {lockReason}
        </TooltipContent>
      </Tooltip>
    );
  }

  return card;
}
