"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface FiberNode {
  tag: number;
  type: { displayName?: string; name?: string } | string | null;
  return: FiberNode | null;
  _debugSource?: { fileName?: string; lineNumber?: number };
}

interface ChainItem {
  name: string;
  file?: string;
  line?: number;
}

function getFiber(element: HTMLElement): FiberNode | null {
  const key = Object.keys(element).find(
    (k) =>
      k.startsWith("__reactFiber$") ||
      k.startsWith("__reactInternalInstance$")
  );
  if (!key) return null;
  return (element as unknown as Record<string, unknown>)[key] as FiberNode;
}

function getComponentChain(element: HTMLElement): ChainItem[] {
  let fiber = getFiber(element);
  const items: ChainItem[] = [];
  const seen = new Set<string>();

  while (fiber) {
    if ((fiber.tag === 0 || fiber.tag === 1) && fiber.type) {
      const t = fiber.type as { displayName?: string; name?: string };
      const name = t.displayName || t.name;
      if (name && !name.startsWith("_") && !seen.has(name)) {
        seen.add(name);
        const item: ChainItem = { name };
        if (fiber._debugSource?.fileName) {
          item.file = fiber._debugSource.fileName.replace(/^\/app\//, "");
          item.line = fiber._debugSource.lineNumber;
        }
        items.push(item);
      }
    }
    fiber = fiber.return;
  }
  return items;
}

export default function ComponentInspector() {
  const [active, setActive] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    chain: ChainItem[];
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<ChainItem[] | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // F2 toggles inspector
      if (e.key === "F2") {
        e.preventDefault();
        setActive((prev) => {
          if (prev) {
            setTooltip(null);
            setPanel(null);
          }
          return !prev;
        });
        return;
      }
      // Escape closes panel / deactivates
      if (e.key === "Escape") {
        if (panel) {
          setPanel(null);
        } else if (active) {
          setActive(false);
          setTooltip(null);
        }
      }
    },
    [active, panel]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!el || el.closest("[data-component-inspector]")) return;

      const chain = getComponentChain(el);
      if (chain.length === 0) return;

      const rect = el.getBoundingClientRect();
      if (highlightRef.current) {
        const h = highlightRef.current;
        h.style.display = "block";
        h.style.top = `${rect.top + window.scrollY}px`;
        h.style.left = `${rect.left + window.scrollX}px`;
        h.style.width = `${rect.width}px`;
        h.style.height = `${rect.height}px`;
      }

      setTooltip({ x: e.clientX, y: e.clientY, chain });
    },
    [active]
  );

  // Click / Shift+Click while inspector is active
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!active || !tooltip) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey) {
        setPanel(tooltip.chain);
      } else {
        navigator.clipboard.writeText(tooltip.chain[0].name).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 800);
        });
      }
    },
    [active, tooltip]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick, true);
    };
  }, [handleKeyDown, handleMouseMove, handleClick]);

  useEffect(() => {
    if (!active && highlightRef.current) {
      highlightRef.current.style.display = "none";
    }
  }, [active]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div data-component-inspector>
      {/* active mode indicator */}
      {active && (
        <div
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            zIndex: 100001,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            background: "#1e1e2e",
            color: "#89b4fa",
            border: "1px solid #45475a",
            borderRadius: 6,
            padding: "4px 10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          Inspector ON &nbsp;
          <span style={{ color: "#585b70" }}>
            F2 / Esc — off
          </span>
        </div>
      )}

      {/* highlight overlay */}
      <div
        ref={highlightRef}
        style={{
          display: "none",
          position: "absolute",
          pointerEvents: "none",
          border: "2px solid #3b82f6",
          borderRadius: 4,
          background: "rgba(59,130,246,0.08)",
          zIndex: 99998,
          transition: "all 0.05s ease-out",
        }}
      />

      {/* hover tooltip */}
      {active && tooltip && !panel && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            zIndex: 99999,
            pointerEvents: "none",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            lineHeight: "18px",
            background: "#1e1e2e",
            color: "#cdd6f4",
            border: "1px solid #45475a",
            borderRadius: 6,
            padding: "6px 10px",
            maxWidth: 360,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ color: "#89b4fa", fontWeight: 600 }}>
            {copied ? "Copied!" : tooltip.chain[0].name}
          </div>
          {tooltip.chain.length > 1 && (
            <div style={{ color: "#6c7086", fontSize: 11, marginTop: 2 }}>
              {tooltip.chain
                .slice(1, 5)
                .map((c) => c.name)
                .join(" > ")}
            </div>
          )}
          <div style={{ color: "#585b70", fontSize: 10, marginTop: 4 }}>
            Click — скопировать &nbsp; Shift+Click — цепочка
          </div>
        </div>
      )}

      {/* full chain panel */}
      {panel && (
        <>
          <div
            onClick={() => setPanel(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 99999,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 100000,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 13,
              background: "#1e1e2e",
              color: "#cdd6f4",
              border: "1px solid #45475a",
              borderRadius: 10,
              padding: "16px 0",
              minWidth: 380,
              maxWidth: 520,
              maxHeight: "70vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            <div
              style={{
                padding: "0 16px 10px",
                borderBottom: "1px solid #313244",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#a6adc8", fontSize: 11 }}>
                Component chain ({panel.length})
              </span>
              <span
                onClick={() => setPanel(null)}
                style={{
                  color: "#6c7086",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Esc / click outside
              </span>
            </div>
            {panel.map((item, i) => (
              <div
                key={item.name}
                onClick={() => copyToClipboard(item.name)}
                style={{
                  padding: "6px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  borderLeft:
                    i === 0
                      ? "3px solid #89b4fa"
                      : "3px solid transparent",
                  background:
                    i === 0 ? "rgba(137,180,250,0.06)" : "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    "rgba(137,180,250,0.1)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    i === 0
                      ? "rgba(137,180,250,0.06)"
                      : "transparent")
                }
              >
                <span
                  style={{
                    color: i === 0 ? "#89b4fa" : "#cdd6f4",
                    fontWeight: i === 0 ? 600 : 400,
                    flexShrink: 0,
                  }}
                >
                  {item.name}
                </span>
                {item.file && (
                  <span style={{ color: "#585b70", fontSize: 11 }}>
                    {item.file}
                    {item.line ? `:${item.line}` : ""}
                  </span>
                )}
              </div>
            ))}
            <div
              style={{
                padding: "8px 16px 0",
                borderTop: "1px solid #313244",
                marginTop: 8,
                color: "#585b70",
                fontSize: 10,
              }}
            >
              Click on any name to copy
            </div>
          </div>
        </>
      )}
    </div>
  );
}
