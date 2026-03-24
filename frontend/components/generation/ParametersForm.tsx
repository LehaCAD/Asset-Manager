"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ParameterOption, ParameterSchemaItem } from "@/lib/types";
import { OptionSelectorPanel } from "./OptionSelectorPanel";

interface ParametersFormProps {
  schema: ParameterSchemaItem[];
  values: Record<string, unknown>;
  onChange: (requestKey: string, value: unknown) => void;
}

export function ParametersForm({ schema, values, onChange }: ParametersFormProps) {
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [activeCustomParam, setActiveCustomParam] = useState<ParameterSchemaItem | null>(null);

  const visibleSchema = schema.filter((param) => param.visible !== false);

  const handleOpenCustom = (param: ParameterSchemaItem) => {
    setActiveCustomParam(param);
    setCustomPanelOpen(true);
  };

  const handleCloseCustom = () => {
    setCustomPanelOpen(false);
    setActiveCustomParam(null);
  };

  const handleCustomSelect = (requestKey: string, value: unknown) => {
    onChange(requestKey, value);
    handleCloseCustom();
  };

  return (
    <div className="space-y-3">
      {visibleSchema.map((param) => (
        <ParameterField
          key={param.request_key}
          param={param}
          value={values[param.request_key]}
          onChange={onChange}
          onOpenCustom={handleOpenCustom}
        />
      ))}

      {activeCustomParam && (
        <OptionSelectorPanel
          isOpen={customPanelOpen}
          onClose={handleCloseCustom}
          title={activeCustomParam.label}
          options={getOverflowOptions(activeCustomParam)}
          selectedValue={values[activeCustomParam.request_key]}
          onSelect={handleCustomSelect}
          requestKey={activeCustomParam.request_key}
          uiSemantic={activeCustomParam.ui_semantic}
        />
      )}
    </div>
  );
}

interface ParameterFieldProps {
  param: ParameterSchemaItem;
  value: unknown;
  onChange: (requestKey: string, value: unknown) => void;
  onOpenCustom: (param: ParameterSchemaItem) => void;
}

function getOverflowOptions(param: ParameterSchemaItem): ParameterOption[] {
  return param.overflow_options ?? param.custom_options ?? [];
}

function getFeaturedOptions(param: ParameterSchemaItem): ParameterOption[] {
  if (param.featured_options && param.featured_options.length > 0) {
    return param.featured_options;
  }
  return param.options ?? [];
}

function getEffectiveControl(param: ParameterSchemaItem): string {
  if (param.control != null && param.control !== "") {
    return param.control;
  }

  switch (param.ui_semantic) {
    case "toggle_group":
      return "toggle_group";
    case "switch":
      return "switch";
    case "number":
      return "number";
    case "aspect_ratio":
      return "toggle_group";
    case "resolution":
    case "quality":
    case "output_format":
    case "duration":
    case "select":
      return "select";
    default:
      return "text";
  }
}

/** Proportional rectangle outline for aspect ratio buttons. Border only, no fill. */
export function AspectRatioIcon({ value }: { value: string }) {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const w = parseInt(parts[0], 10);
  const h = parseInt(parts[1], 10);
  if (!w || !h) return null;

  const maxSize = 24;
  const ratio = w / h;
  const width = Math.max(ratio >= 1 ? maxSize : Math.round(maxSize * ratio), 6);
  const height = Math.max(ratio <= 1 ? maxSize : Math.round(maxSize / ratio), 4);

  return (
    <span
      className="inline-block rounded-[2px] border-[1.5px] border-current"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}

function ParameterField({ param, value, onChange, onOpenCustom }: ParameterFieldProps) {
  const {
    request_key,
    label,
    options,
    min,
    max,
    step,
    show_other_button,
  } = param;
  const effectiveControl = getEffectiveControl(param);

  if (effectiveControl === "toggle_group") {
    const currentValue = value as string | number | undefined;
    const featuredOptions = getFeaturedOptions(param);
    const overflowOptions = getOverflowOptions(param);
    const hasOverflow = (show_other_button ?? false) && overflowOptions.length > 0;
    const selectedOverflowOption = overflowOptions.find((opt) => opt.value === currentValue);
    const isAspectRatio = param.ui_semantic === "aspect_ratio";
    const isResolution = param.ui_semantic === "resolution";

    // Layout: aspect_ratio → 4-col grid, others → flex wrap
    const containerClass = isAspectRatio
      ? "grid grid-cols-4 gap-1.5"
      : "flex flex-wrap gap-1.5";

    // Sizing: aspect_ratio → square-ish with icon, resolution → medium pills, others → compact pills
    const buttonSizeClass = isAspectRatio
      ? "flex flex-col items-center justify-center gap-0.5 h-11"
      : isResolution
        ? "h-8 px-4"
        : "h-7 px-2";

    const selectedClass = "bg-primary/15 text-primary border-primary/50";
    const unselectedClass = "bg-card/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/30";

    return (
      <div className="space-y-2.5">
        <label className="text-sm font-medium">{label}</label>
        <div className={containerClass}>
          {featuredOptions.map((opt) => {
            const isSelected = currentValue === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onChange(request_key, opt.value)}
                className={cn(
                  "rounded-md text-xs font-medium transition-all duration-150 border",
                  buttonSizeClass,
                  isSelected ? selectedClass : unselectedClass,
                )}
              >
                {isAspectRatio && <AspectRatioIcon value={String(opt.value)} />}
                <span className={isAspectRatio ? "text-[10px]" : ""}>{opt.label}</span>
              </button>
            );
          })}
          {hasOverflow && (
            <button
              type="button"
              onClick={() => onOpenCustom(param)}
              className={cn(
                "rounded-md text-xs font-medium transition-all duration-150 border",
                buttonSizeClass,
                selectedOverflowOption ? selectedClass : unselectedClass,
              )}
            >
              <span className={isAspectRatio ? "text-[10px]" : ""}>{selectedOverflowOption?.label ?? "Другое"}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (effectiveControl === "select") {
    const currentValue = value as string | number | undefined;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        <Select
          value={
            currentValue === undefined || currentValue === null
              ? ""
              : String(currentValue)
          }
          onValueChange={(val: string) => {
            const selected = options?.find((opt) => String(opt.value) === val);
            onChange(request_key, selected?.value ?? val);
          }}
        >
          <SelectTrigger className="w-full bg-background h-8 text-xs">
            <SelectValue placeholder="Выберите..." />
          </SelectTrigger>
          <SelectContent>
            {options?.map((opt) => (
              <SelectItem key={String(opt.value)} value={String(opt.value)} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (effectiveControl === "switch" || effectiveControl === "checkbox") {
    const boolValue = value as boolean | undefined;

    return (
      <div className="flex items-center justify-between py-0.5">
        <label className="text-sm font-medium">{label}</label>
        <Switch
          checked={boolValue ?? false}
          onCheckedChange={(checked) => onChange(request_key, checked)}
        />
      </div>
    );
  }

  if (effectiveControl === "number") {
    const numValue = value as number | undefined;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={numValue ?? ""}
          onChange={(e) => {
            const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
            onChange(request_key, val);
          }}
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm h-8",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        />
      </div>
    );
  }

  const textValue = typeof value === "string" ? value : "";

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="text"
        value={textValue}
        onChange={(e) => onChange(request_key, e.target.value)}
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm h-8",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      />
    </div>
  );
}
