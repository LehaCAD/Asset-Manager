"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SelectDropdown({
  options,
  value,
  onChange,
  placeholder = "Выберите...",
  className,
}: SelectDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center justify-between gap-2 h-8 px-3 rounded-lg border border-border text-xs font-medium transition-colors",
            "bg-muted/60 text-foreground hover:bg-muted w-full sm:w-auto sm:min-w-[120px]",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[180px] p-1 border-border bg-popover"
        sideOffset={4}
      >
        <div className="flex flex-col">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left",
                value === option.value
                  ? "bg-primary/10 text-foreground"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              )}
            >
              <Check
                className={cn(
                  "h-3 w-3 shrink-0",
                  value === option.value ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
