"use client";

import { useRef, useEffect, useState } from "react";
import { showcaseItems } from "./showcase-items";
import { ShowcaseCard } from "./ShowcaseCard";
import { ShowcaseItemRenderer } from "./showcase-components";

const orbStyles: React.CSSProperties[] = [
  { width: 500, height: 500, top: "-10%", left: "-5%", background: "radial-gradient(circle, rgba(108,92,231,0.07) 0%, transparent 70%)" },
  { width: 400, height: 400, bottom: "5%", right: "5%", background: "radial-gradient(circle, rgba(14,165,233,0.05) 0%, transparent 70%)" },
  { width: 450, height: 450, top: "30%", left: "25%", background: "radial-gradient(circle, rgba(139,124,247,0.05) 0%, transparent 70%)" },
  { width: 300, height: 300, bottom: "25%", left: "5%", background: "radial-gradient(circle, rgba(245,158,11,0.03) 0%, transparent 70%)" },
  { width: 350, height: 350, top: "10%", right: "15%", background: "radial-gradient(circle, rgba(108,92,231,0.04) 0%, transparent 70%)" },
];

export function FloatingField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [mounted, setMounted] = useState(false);
  const orbRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    setMounted(true);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = containerRef.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width - 0.5;
      const my = (e.clientY - rect.top) / rect.height - 0.5;
      orbRefs.current.forEach((orb, i) => {
        if (!orb) return;
        const f = (i + 1) * 8;
        orb.style.transform = `translate(${mx * f}px, ${my * f}px)`;
      });
    }
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      <style>{`@keyframes gridPan { to { transform: translate(50px, 50px); } }`}</style>

      {/* Grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,124,247,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(139,124,247,0.6) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
          animation: "gridPan 40s linear infinite",
        }}
      />

      {/* Glow orbs */}
      {orbStyles.map((style, i) => (
        <div
          key={i}
          ref={(el) => { orbRefs.current[i] = el; }}
          className="pointer-events-none absolute rounded-full"
          style={{ ...style, filter: "blur(80px)" }}
        />
      ))}

      {/* Floating items */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        {dimensions.w > 0 &&
          showcaseItems.map((item) => (
            <ShowcaseCard
              key={item.id}
              x={(item.x / 100) * dimensions.w}
              y={(item.y / 100) * dimensions.h}
              float={item.float}
            >
              <div style={{ width: item.width || undefined }}>
                <ShowcaseItemRenderer item={item} />
              </div>
            </ShowcaseCard>
          ))}
      </div>
    </div>
  );
}
