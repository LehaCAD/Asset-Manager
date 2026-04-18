"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { ShowcaseItemConfig } from "./showcase-items";

/* ─────────────────────────────────────────────
   1. ShowcaseProjectCard
   ───────────────────────────────────────────── */
function ShowcaseProjectCard({ content, width }: { content: Record<string, unknown>; width: number }) {
  const thumbs = (content.thumbs as string[]) || [];
  const cols = thumbs.length <= 2 ? 2 : thumbs.length === 3 ? 3 : 2;

  return (
    <div
      className="group bg-[#1C2640] border border-[#2D3A55] rounded-md overflow-hidden cursor-pointer hover:border-[#8B7CF7]/40 hover:shadow-md hover:shadow-[#8B7CF7]/5 transition-all"
      style={{ width }}
    >
      <div
        className="aspect-[16/10] p-1.5 gap-1"
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {thumbs.map((url, i) => (
          <img
            key={i}
            src={url}
            alt=""
            className="rounded object-cover w-full h-full"
            draggable={false}
          />
        ))}
      </div>
      <div className="px-3 py-2.5 border-t border-[#2D3A55]">
        <div className="text-[13px] font-medium text-[#EFF1F5] group-hover:text-[#8B7CF7] transition-colors">
          {content.name as string}
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8B8FA3]">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: content.statusColor as string }}
          />
          <span>{content.count as number} кадров</span>
          <span className="text-[#8B7CF7]/30">&middot;</span>
          <span>{content.time as string}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   2. ShowcaseElementCard
   ───────────────────────────────────────────── */
function ShowcaseElementCard({ content, width }: { content: Record<string, unknown>; width: number }) {
  const [checked, setChecked] = useState(false);
  const comments = (content.comments as number) || 0;
  const approval = content.approval as string | undefined;
  const filename = content.filename as string | undefined;

  const approvalMap: Record<string, { bg: string; text: string; label: string }> = {
    approved: { bg: "rgba(34,197,94,0.12)", text: "#4ADE80", label: "Согласовано" },
    progress: { bg: "rgba(59,130,246,0.12)", text: "#60A5FA", label: "На проверке" },
    changes: { bg: "rgba(249,115,22,0.12)", text: "#F97316", label: "Правки" },
  };

  return (
    <div className="group relative rounded-md overflow-hidden bg-[#1C2640] cursor-pointer" style={{ width }}>
      <img
        src={content.image as string}
        alt=""
        className="w-full aspect-square object-cover"
        draggable={false}
      />

      {/* Badge top-right */}
      {!!content.badge && (
        <span className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[9px] text-white/85">
          {content.badge as string}
        </span>
      )}

      {/* Select checkbox top-left */}
      <span
        data-interactive
        className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center transition-opacity cursor-pointer border ${
          checked
            ? "bg-[#8B7CF7] border-[#8B7CF7] opacity-100"
            : "bg-black/40 backdrop-blur-sm border-white/30 opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => { e.stopPropagation(); setChecked(!checked); }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      {/* Comments badge bottom-left */}
      {comments > 0 && (
        <span className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm rounded px-2 h-5 text-[10px] text-white/85 flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M2 3h12v8H5l-3 3V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {comments}
        </span>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      {/* Footer */}
      {filename && (
        <div className="px-2.5 py-2 border-t border-[#2D3A55] bg-[#1C2640] flex items-center justify-between">
          <span className="text-[10px] font-medium text-[#EFF1F5]">{filename}</span>
          {approval && approvalMap[approval] && (
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: approvalMap[approval].bg, color: approvalMap[approval].text }}
            >
              {approvalMap[approval].label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   3. ShowcaseGroupCard
   ───────────────────────────────────────────── */
function ShowcaseGroupCard({ content, width }: { content: Record<string, unknown>; width: number }) {
  const thumbs = (content.thumbs as string[]) || [];

  return (
    <div className="relative cursor-pointer transition-transform hover:scale-[1.03]" style={{ width }}>
      {/* Back layer */}
      <div className="absolute inset-x-2 top-0 h-full rounded-md bg-[#1C2640] border border-[#2D3A55] opacity-30 -translate-y-1.5" />
      {/* Middle layer */}
      <div className="absolute inset-x-1 top-0 h-full rounded-md bg-[#1C2640] border border-[#2D3A55] opacity-50 -translate-y-0.5" />
      {/* Front layer */}
      <div className="relative rounded-md overflow-hidden bg-[#1C2640] border border-[#2D3A55] hover:border-[#8B7CF7]/40 transition-colors">
        <div className="aspect-[16/10] bg-[#111827] p-1.5 grid grid-cols-2 gap-1">
          {thumbs.map((url, i) => (
            <img key={i} src={url} alt="" className="rounded object-cover w-full h-full" draggable={false} />
          ))}
        </div>
        <div className="px-3 py-2 border-t border-[#2D3A55]">
          <div className="text-[12px] font-medium text-[#EFF1F5]">{content.name as string}</div>
          <div className="text-[10px] text-[#8B8FA3] mt-0.5">
            {content.groups as number} групп &middot; {content.count as number} элементов
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   4. ShowcaseComment
   ───────────────────────────────────────────── */
function ShowcaseComment({ content, width }: { content: Record<string, unknown>; width: number }) {
  const [activeButtons, setActiveButtons] = useState<Record<number, boolean>>({});
  const buttons = ["\uD83D\uDC4D", "\u2764\uFE0F", "\u21A9\uFE0F"];

  const toggleButton = (idx: number) => {
    setActiveButtons((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div
      className="bg-[#1C2640] border border-[#2D3A55] rounded-xl rounded-bl-sm p-2.5 cursor-default group transition-colors hover:border-[#8B7CF7]/30"
      style={{ maxWidth: width || 200 }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white bg-gradient-to-br ${content.color as string}`}
        >
          {content.initial as string}
        </span>
        <span className="text-[10px] font-semibold text-[#EFF1F5]">{content.name as string}</span>
        <span className="text-[9px] text-[#565A6E] ml-auto">{content.time as string}</span>
      </div>
      <div className="text-[11px] text-[#EFF1F5]/90 leading-[1.45]">{content.text as string}</div>
      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {buttons.map((emoji, idx) => (
          <button
            key={idx}
            data-interactive
            className={`rounded px-2 py-0.5 text-[9px] cursor-pointer transition-colors border ${
              activeButtons[idx]
                ? "bg-[#8B7CF7] text-white border-[#8B7CF7]"
                : "bg-[#151D30] border-[#2D3A55] text-[#8B8FA3] hover:bg-[#8B7CF7] hover:text-white hover:border-[#8B7CF7]"
            }`}
            onClick={(e) => { e.stopPropagation(); toggleButton(idx); }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   5. ShowcaseReactionGroup
   ───────────────────────────────────────────── */
function ShowcaseReactionGroup({ content }: { content: Record<string, unknown> }) {
  const reactions = content.reactions as { emoji: string; count: number }[];
  const [active, setActive] = useState<boolean[]>(() => reactions.map(() => false));

  const toggle = (idx: number) => {
    setActive((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  return (
    <div className="flex gap-1">
      {reactions.map((r, idx) => (
        <span
          key={idx}
          data-interactive
          className={`rounded-full px-2.5 py-1 text-[11px] flex items-center gap-1 cursor-pointer select-none transition-all border ${
            active[idx]
              ? "border-[#8B7CF7] bg-[#8B7CF7]/10"
              : "bg-[#1C2640] border-[#2D3A55] hover:border-[#8B7CF7]/40"
          }`}
          onClick={(e) => { e.stopPropagation(); toggle(idx); }}
        >
          <span>{r.emoji}</span>
          <span className={`text-[10px] ${active[idx] ? "text-[#8B7CF7]" : "text-[#8B8FA3]"}`}>
            {r.count + (active[idx] ? 1 : 0)}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   6. ShowcaseShareBadge
   ───────────────────────────────────────────── */
function ShowcaseShareBadge({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="bg-[#6C5CE7]/12 border border-[#6C5CE7]/20 rounded-full px-3.5 py-1.5 flex items-center gap-2 backdrop-blur-sm">
      <span className="w-4 h-4 rounded-full bg-[#6C5CE7] flex items-center justify-center">
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
          <path d="M3 9L9 3M9 3H4M9 3v5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[10px] font-medium text-[#a78bfa]">{content.label as string}</span>
      <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] relative">
        <span className="absolute inset-0 rounded-full bg-[#10b981] animate-ping opacity-75" />
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   7. ShowcaseStatusBadge
   ───────────────────────────────────────────── */
function ShowcaseStatusBadge({ content }: { content: Record<string, unknown> }) {
  const variant = content.variant as string;
  const isSuccess = variant === "success";
  const color = isSuccess ? "#4ADE80" : "#60A5FA";
  const borderColor = isSuccess ? "#4ADE80" : "#3B82F6";

  return (
    <div
      className="rounded-full px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-medium"
      style={{
        backgroundColor: `${borderColor}1a`,
        border: `1px solid ${borderColor}33`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full relative" style={{ backgroundColor: color }}>
        <span className="absolute inset-0 rounded-full animate-ping opacity-75" style={{ backgroundColor: color }} />
      </span>
      {content.label as string}
    </div>
  );
}

/* ─────────────────────────────────────────────
   8. ShowcaseNotification
   ───────────────────────────────────────────── */
function ShowcaseNotification({ content, width }: { content: Record<string, unknown>; width: number }) {
  const iconColor = content.iconColor as string;

  const iconConfig: Record<string, { bg: string; stroke: string; svg: ReactNode }> = {
    primary: {
      bg: "rgba(139,124,247,0.15)",
      stroke: "#8B7CF7",
      svg: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 3h12v8H5l-3 3V3z" stroke="#8B7CF7" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ),
    },
    success: {
      bg: "rgba(74,222,128,0.12)",
      stroke: "#10b981",
      svg: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3 3 7-7" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    warning: {
      bg: "rgba(245,158,11,0.12)",
      stroke: "#F59E0B",
      svg: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="5" width="12" height="3" rx="1" stroke="#F59E0B" strokeWidth="1.5" />
          <rect x="3" y="9" width="10" height="3" rx="1" stroke="#F59E0B" strokeWidth="1.5" />
        </svg>
      ),
    },
  };

  const cfg = iconConfig[iconColor] || iconConfig.primary;

  return (
    <div
      className="bg-[#1C2640] border border-[#2D3A55] rounded-lg p-2.5 flex items-center gap-2.5 cursor-pointer transition-colors hover:border-[#8B7CF7]/30"
      style={{ minWidth: width || 200 }}
    >
      <span
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: cfg.bg }}
      >
        {cfg.svg}
      </span>
      <div>
        <div className="text-[11px] font-semibold text-[#EFF1F5]">{content.title as string}</div>
        <div className="text-[10px] text-[#8B8FA3] mt-0.5">{content.desc as string}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   9. ShowcaseChatBubble (placeholder — not used in config)
   ───────────────────────────────────────────── */
function ShowcaseChatBubble({ content, width }: { content: Record<string, unknown>; width: number }) {
  return (
    <div
      className="bg-[#1C2640] border border-[#2D3A55] rounded-xl rounded-bl-sm p-2.5"
      style={{ maxWidth: width || 200 }}
    >
      <div className="text-[11px] text-[#EFF1F5]/90 leading-[1.45]">{(content.text as string) || ""}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   10. ShowcaseReviewPill
   ───────────────────────────────────────────── */
function ShowcaseReviewPill({ content }: { content: Record<string, unknown> }) {
  const variant = content.variant as string;
  const isApproved = variant === "approved";

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-semibold flex items-center gap-1"
      style={{
        backgroundColor: isApproved ? "rgba(34,197,94,0.1)" : "rgba(249,115,22,0.1)",
        color: isApproved ? "#4ADE80" : "#F97316",
      }}
    >
      {isApproved ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M7.5 2.5L9.5 4.5M2 10l.5-2L8.5 2l2 2-6 6-2 .5z" stroke="#F97316" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {content.label as string}
    </span>
  );
}

/* ─────────────────────────────────────────────
   ShowcaseItemRenderer — switch by type
   ───────────────────────────────────────────── */
export function ShowcaseItemRenderer({ item }: { item: ShowcaseItemConfig }) {
  switch (item.type) {
    case "project-card":
      return <ShowcaseProjectCard content={item.content} width={item.width} />;
    case "element-card":
      return <ShowcaseElementCard content={item.content} width={item.width} />;
    case "group-card":
      return <ShowcaseGroupCard content={item.content} width={item.width} />;
    case "comment":
      return <ShowcaseComment content={item.content} width={item.width} />;
    case "reaction-group":
      return <ShowcaseReactionGroup content={item.content} />;
    case "share-badge":
      return <ShowcaseShareBadge content={item.content} />;
    case "status-badge":
      return <ShowcaseStatusBadge content={item.content} />;
    case "notification":
      return <ShowcaseNotification content={item.content} width={item.width} />;
    case "chat-bubble":
      return <ShowcaseChatBubble content={item.content} width={item.width} />;
    case "review-pill":
      return <ShowcaseReviewPill content={item.content} />;
    default:
      return null;
  }
}

export {
  ShowcaseProjectCard,
  ShowcaseElementCard,
  ShowcaseGroupCard,
  ShowcaseComment,
  ShowcaseReactionGroup,
  ShowcaseShareBadge,
  ShowcaseStatusBadge,
  ShowcaseNotification,
  ShowcaseChatBubble,
  ShowcaseReviewPill,
};
