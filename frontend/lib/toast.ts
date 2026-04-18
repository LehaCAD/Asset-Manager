"use client";

import { toast as sonner } from "sonner";

// BF-02-01/02/07: "deferrable" regular toasts wait briefly so a luxury
// achievement toast arriving over WebSocket can cancel the noisy "created"
// toast. The achievement is the higher-priority signal — regular falls back
// only when no achievement fires.
const DEFER_MS = 1200;

const pendingRegulars = new Map<string, ReturnType<typeof setTimeout>>();

type Kind = "success" | "error" | "info" | "warning";
type RegularPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ToastOptions {
  duration?: number;
  /** Key — same key cancels prior pending toast; luxury cancels all. */
  deferrable?: string;
  id?: string;
}

function isMobile(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 639px)").matches
  );
}

function regularPosition(): RegularPosition {
  return isMobile() ? "top-center" : "bottom-right";
}

function show(kind: Kind, msg: string, opts: ToastOptions = {}) {
  const { deferrable, duration = 3000, id } = opts;

  const fire = () => {
    sonner[kind](msg, { duration, position: regularPosition(), id });
    if (deferrable) pendingRegulars.delete(deferrable);
  };

  if (!deferrable) {
    fire();
    return;
  }

  const prev = pendingRegulars.get(deferrable);
  if (prev) clearTimeout(prev);
  const t = setTimeout(fire, DEFER_MS);
  pendingRegulars.set(deferrable, t);
}

export const toastSuccess = (msg: string, opts?: ToastOptions) =>
  show("success", msg, opts);
export const toastError = (msg: string, opts?: ToastOptions) =>
  show("error", msg, opts);
export const toastInfo = (msg: string, opts?: ToastOptions) =>
  show("info", msg, opts);
export const toastWarning = (msg: string, opts?: ToastOptions) =>
  show("warning", msg, opts);

/** Called by luxury/achievement toast to suppress queued regular toasts. */
export function cancelPendingRegulars() {
  pendingRegulars.forEach((t) => clearTimeout(t));
  pendingRegulars.clear();
}
