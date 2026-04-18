"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ArrowSide = "left" | "right" | "top" | "bottom";

interface HintBubbleProps {
  /** Where the arrow attaches on the bubble (arrow points OUT of this side). */
  arrow: ArrowSide;
  /** Tailwind positioning classes applied to the absolute wrapper. */
  positionClassName?: string;
  /** Inline positioning styles — takes precedence over positionClassName. */
  positionStyle?: React.CSSProperties;
  /** Body content. */
  children: ReactNode;
  /** Called when user clicks the dismiss X. */
  onDismiss: () => void;
  /** Fixed width for the bubble. If a number → px. If a string → raw CSS. */
  width?: number | string;
  /** When true, plays the fade-out animation (parent owns actual unmount). */
  closing?: boolean;
}

const ARROW_SIZE = 7;
// Match the "Откройте проект" badge: same gradient, same arrow colour (bottom of gradient).
const BG_GRADIENT = "linear-gradient(135deg, #8B7CF7, #6B5CE7)";
const ARROW_COLOR = "#6B5CE7";

/**
 * The bob direction is derived from the arrow side:
 * the bubble gently nudges TOWARD the target it's pointing at.
 */
function bobClassFor(arrow: ArrowSide, closing: boolean): string {
  if (closing) return "animate-hint-exit";
  switch (arrow) {
    case "left":
      return "animate-hint-enter-left";
    case "right":
      return "animate-hint-enter-right";
    case "top":
      return "animate-hint-enter-up";
    case "bottom":
      return "animate-hint-enter-down";
  }
}

export function HintBubble({
  arrow,
  positionClassName,
  positionStyle,
  children,
  onDismiss,
  width = 260,
  closing = false,
}: HintBubbleProps) {
  const arrowStyle = getArrowStyle(arrow);

  return (
    <div
      className={cn("absolute z-40 pointer-events-auto", positionClassName)}
      style={{
        width: typeof width === "number" ? width : width,
        maxWidth: "calc(100vw - 32px)",
        ...positionStyle,
      }}
    >
      {/* Animation wrapper — owns fade-in / bob / fade-out transforms */}
      <div className={bobClassFor(arrow, closing)}>
        {/* Bubble */}
        <div
          className="relative"
          style={{
            background: BG_GRADIENT,
            borderRadius: 12,
            padding: "12px 34px 12px 14px",
            color: "white",
            fontSize: 13,
            lineHeight: 1.4,
            boxShadow: "0 6px 16px rgba(107, 92, 231, 0.22)",
          }}
        >
          {children}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            aria-label="Скрыть подсказку"
            className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-md text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Arrow — single solid triangle */}
          <span aria-hidden className="absolute" style={arrowStyle} />
        </div>
      </div>
    </div>
  );
}

function getArrowStyle(side: ArrowSide): React.CSSProperties {
  switch (side) {
    case "left":
      return {
        top: "50%",
        left: -ARROW_SIZE,
        transform: "translateY(-50%)",
        width: 0,
        height: 0,
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid ${ARROW_COLOR}`,
      };
    case "right":
      return {
        top: "50%",
        right: -ARROW_SIZE,
        transform: "translateY(-50%)",
        width: 0,
        height: 0,
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderLeft: `${ARROW_SIZE}px solid ${ARROW_COLOR}`,
      };
    case "top":
      return {
        left: "50%",
        top: -ARROW_SIZE,
        transform: "translateX(-50%)",
        width: 0,
        height: 0,
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid ${ARROW_COLOR}`,
      };
    case "bottom":
      return {
        left: "50%",
        bottom: -ARROW_SIZE,
        transform: "translateX(-50%)",
        width: 0,
        height: 0,
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderTop: `${ARROW_SIZE}px solid ${ARROW_COLOR}`,
      };
  }
}
