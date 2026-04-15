"use client";

import { useRef, useEffect, useCallback, type ReactNode } from "react";

interface ShowcaseCardProps {
  children: ReactNode;
  x: number;
  y: number;
  float: { amplitudeX: number; amplitudeY: number; speedX: number; speedY: number };
  className?: string;
}

export function ShowcaseCard({ children, x, y, float, className = "" }: ShowcaseCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const position = useRef({ x, y });
  const floatOffset = useRef({ x: 0, y: 0 });
  const animId = useRef(0);
  const phase = useRef(Math.random() * Math.PI * 2);

  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Float animation
  useEffect(() => {
    if (prefersReducedMotion.current) return;
    const p = phase.current;
    function tick(t: number) {
      if (isDragging.current || !ref.current) {
        animId.current = requestAnimationFrame(tick);
        return;
      }
      floatOffset.current.x = Math.sin(t * float.speedX * 0.001 + p) * float.amplitudeX;
      floatOffset.current.y = Math.cos(t * float.speedY * 0.001 + p) * float.amplitudeY;
      ref.current.style.transform = `translate(${position.current.x + floatOffset.current.x}px, ${position.current.y + floatOffset.current.y}px)`;
      animId.current = requestAnimationFrame(tick);
    }
    animId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId.current);
  }, [float]);

  // Initial position
  useEffect(() => {
    if (ref.current) {
      ref.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, [x, y]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, label, [data-interactive]")) return;

    isDragging.current = true;
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    el.style.zIndex = "1000";
    el.style.cursor = "grabbing";

    const rect = el.getBoundingClientRect();
    const parentRect = el.parentElement!.getBoundingClientRect();
    dragOffset.current.x = e.clientX - (rect.left - parentRect.left);
    dragOffset.current.y = e.clientY - (rect.top - parentRect.top);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !ref.current) return;
    const el = ref.current;
    const parentRect = el.parentElement!.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    let newX = e.clientX - parentRect.left - dragOffset.current.x;
    let newY = e.clientY - parentRect.top - dragOffset.current.y;
    // Clamp to container bounds
    newX = Math.max(0, Math.min(newX, parentRect.width - elRect.width));
    newY = Math.max(0, Math.min(newY, parentRect.height - elRect.height));
    position.current = { x: newX, y: newY };
    el.style.transform = `translate(${newX}px, ${newY}px)`;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !ref.current) return;
    isDragging.current = false;
    ref.current.releasePointerCapture(e.pointerId);
    ref.current.style.zIndex = "";
    ref.current.style.cursor = "";
  }, []);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !ref.current) return;
    isDragging.current = false;
    ref.current.releasePointerCapture(e.pointerId);
    ref.current.style.zIndex = "";
    ref.current.style.cursor = "";
  }, []);

  return (
    <div
      ref={ref}
      className={`absolute cursor-grab transition-shadow duration-300 hover:z-50 ${className}`}
      style={{ willChange: "transform" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {children}
    </div>
  );
}
