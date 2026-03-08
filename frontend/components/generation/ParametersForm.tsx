"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ParameterSchemaItem } from "@/lib/types";
import { OptionSelectorPanel } from "./OptionSelectorPanel";

interface ParametersFormProps {
  schema: ParameterSchemaItem[];
  values: Record<string, unknown>;
  onChange: (requestKey: string, value: unknown) => void;
}

export function ParametersForm({ schema, values, onChange }: ParametersFormProps) {
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [activeCustomParam, setActiveCustomParam] = useState<ParameterSchemaItem | null>(null);

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
    <div className="space-y-4">
      {schema.map((param) => (
        <ParameterField
          key={param.request_key}
          param={param}
          value={values[param.request_key]}
          onChange={onChange}
          onOpenCustom={handleOpenCustom}
        />
      ))}

      {/* Custom option selector panel */}
      {activeCustomParam && (
        <OptionSelectorPanel
          isOpen={customPanelOpen}
          onClose={handleCloseCustom}
          title={activeCustomParam.label}
          options={activeCustomParam.custom_options || []}
          selectedValue={values[activeCustomParam.request_key]}
          onSelect={handleCustomSelect}
          requestKey={activeCustomParam.request_key}
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

function ParameterField({ param, value, onChange, onOpenCustom }: ParameterFieldProps) {
  const { request_key, label, ui_semantic, options, custom_options, min, max, step } = param;

  // aspect_ratio, resolution - preset buttons + optional Custom
  if (ui_semantic === "aspect_ratio" || ui_semantic === "resolution") {
    const hasCustomOptions = custom_options && custom_options.length > 0;
    const currentValue = value as string | number | undefined;
    const isCustomSelected = hasCustomOptions && currentValue && 
      !options?.some(opt => opt.value === currentValue);

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex flex-wrap gap-2">
          {options?.map((opt) => (
            <Button
              key={String(opt.value)}
              type="button"
              variant={currentValue === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(request_key, opt.value)}
            >
              {opt.label}
            </Button>
          ))}
          {hasCustomOptions && (
            <Button
              type="button"
              variant={isCustomSelected ? "default" : "outline"}
              size="sm"
              onClick={() => onOpenCustom(param)}
            >
              {isCustomSelected && currentValue ?
                (options?.find(o => o.value === currentValue)?.label || String(currentValue)) :
                "Custom"
              }
            </Button>
          )}
        </div>
      </div>
    );
  }

  // quality, output_format, duration, select - dropdown
  if (ui_semantic === "quality" || ui_semantic === "output_format" || 
      ui_semantic === "duration" || ui_semantic === "select") {
    const currentValue = value as string | number | undefined;
    
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        <select
          value={currentValue ?? ""}
          onChange={(e) => {
            const selected = options?.find(opt => String(opt.value) === e.target.value);
            onChange(request_key, selected?.value ?? e.target.value);
          }}
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          {options?.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // switch - boolean toggle
  if (ui_semantic === "switch") {
    const boolValue = value as boolean | undefined;
    
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Switch
          checked={boolValue ?? false}
          onCheckedChange={(checked) => onChange(request_key, checked)}
        />
      </div>
    );
  }

  // slider - range input
  if (ui_semantic === "slider") {
    const numValue = (value as number) ?? min ?? 0;
    const sliderMin = min ?? 0;
    const sliderMax = max ?? 100;
    const sliderStep = step ?? 1;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{label}</label>
          <span className="text-sm text-muted-foreground">{numValue}</span>
        </div>
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={numValue}
          onChange={(e) => onChange(request_key, parseFloat(e.target.value))}
          className="w-full accent-primary"
        />
      </div>
    );
  }

  // number - number input
  if (ui_semantic === "number") {
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
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        />
      </div>
    );
  }

  // toggle_group - button group
  if (ui_semantic === "toggle_group") {
    const currentValue = value as string | undefined;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        <ToggleGroup
          type="single"
          value={currentValue}
          onValueChange={(val) => val && onChange(request_key, val)}
          variant="outline"
          className="flex-wrap justify-start"
        >
          {options?.map((opt) => (
            <ToggleGroupItem key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    );
  }

  // Fallback: render as select if options exist
  if (options && options.length > 0) {
    const currentValue = value as string | number | undefined;
    
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        <select
          value={currentValue ?? ""}
          onChange={(e) => {
            const selected = options.find(opt => String(opt.value) === e.target.value);
            onChange(request_key, selected?.value ?? e.target.value);
          }}
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          {options.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Unknown semantic - skip rendering
  return null;
}
