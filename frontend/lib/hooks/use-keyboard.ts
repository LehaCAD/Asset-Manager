import { useEffect } from "react";

export interface UseKeyboardOptions {
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onEscape?: () => void;
  onF?: () => void;
  onDelete?: () => void;
  enabled?: boolean;
}

export function useKeyboard(options: UseKeyboardOptions) {
  useEffect(() => {
    if (options.enabled === false) return;

    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Only handle Escape in inputs
        if (e.key === "Escape") {
          options.onEscape?.();
          if (target instanceof HTMLElement) {
            target.blur();
          }
        }
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          options.onArrowLeft?.();
          break;
        case "ArrowRight":
          options.onArrowRight?.();
          break;
        case "Escape":
          options.onEscape?.();
          break;
        case "f":
        case "F":
        case "а":
        case "А":
          options.onF?.();
          break;
        case "Delete":
          options.onDelete?.();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [options]);
}
