"use client";

import { useEffect, useState, useCallback } from "react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getHistory } from "@/lib/api/cabinet";
import { formatDateTime, formatStorage, formatCurrency } from "@/lib/utils/format";
import type { CabinetHistoryEntry, PaginatedResponse, AIModel, Project } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiClient } from "@/lib/api/client";
import { ChevronLeft, ChevronRight, Copy, Check, ImageIcon, Download, Film, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

/* ── Filter options ─────────────────────────────────────── */

const STATUSES = [
  { value: "", label: "Все статусы" },
  { value: "COMPLETED", label: "Готово" },
  { value: "FAILED", label: "Ошибка" },
  { value: "PROCESSING", label: "Обработка" },
  { value: "PENDING", label: "Ожидание" },
];

const SOURCES = [
  { value: "", label: "Все источники" },
  { value: "GENERATED", label: "Генерация" },
  { value: "UPLOADED", label: "Загрузка" },
];

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-success/10 text-success",
  FAILED: "bg-destructive/10 text-destructive",
  PROCESSING: "bg-warning/10 text-warning",
  PENDING: "bg-muted text-muted-foreground",
  UPLOADING: "bg-primary/10 text-primary",
};

/* ── Helpers ────────────────────────────────────────────── */

function dateRangeToParams(range: DateRange | undefined) {
  if (!range?.from) return {};
  const from = format(range.from, "yyyy-MM-dd");
  const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
  return { date_from: from, date_to: to };
}

function defaultRange(): DateRange {
  const now = new Date();
  return { from: subDays(now, 29), to: now };
}

const IS_GENERATED = new Set(["GENERATED", "IMG2VID"]);

/* ── Main Component ─────────────────────────────────────── */

export default function HistoryPage() {
  const [data, setData] = useState<PaginatedResponse<CabinetHistoryEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [modelId, setModelId] = useState<number | undefined>();
  const [projectId, setProjectId] = useState<number | undefined>();
  const [models, setModels] = useState<AIModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);

  useEffect(() => {
    apiClient.get("/api/ai-models/").then((r) => setModels(r.data));
    apiClient.get("/api/projects/").then((r) => setProjects(r.data));
  }, []);

  /* When source is UPLOADED, model filter makes no sense → reset */
  useEffect(() => {
    if (sourceType === "UPLOADED" && modelId !== undefined) {
      setModelId(undefined);
    }
  }, [sourceType, modelId]);

  const showModelFilter = sourceType !== "UPLOADED";

  const load = useCallback(() => {
    setLoading(true);
    getHistory({
      page,
      status: status || undefined,
      source_type: sourceType || undefined,
      ai_model_id: modelId,
      project_id: projectId,
      ...dateRangeToParams(dateRange),
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, status, sourceType, modelId, projectId, dateRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, sourceType, modelId, projectId, dateRange]);

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground">Журнал</h1>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SelectDropdown options={SOURCES} value={sourceType} onChange={setSourceType} />
        {showModelFilter && (
          <SelectDropdown
            options={[
              { value: "", label: "Все модели" },
              ...models.map((m) => ({ value: String(m.id), label: m.name })),
            ]}
            value={modelId !== undefined ? String(modelId) : ""}
            onChange={(v) => setModelId(v ? Number(v) : undefined)}
          />
        )}
        <SelectDropdown options={STATUSES} value={status} onChange={setStatus} />
        <SelectDropdown
          options={[
            { value: "", label: "Все проекты" },
            ...projects.map((p) => ({ value: String(p.id), label: p.name })),
          ]}
          value={projectId !== undefined ? String(projectId) : ""}
          onChange={(v) => setProjectId(v ? Number(v) : undefined)}
        />
        <div className="ml-auto">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card/80 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Дата</th>
              <th className="text-left px-3 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Источник</th>
              <th className="text-left px-3 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Промпт</th>
              <th className="text-left px-3 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[56px]">Результат</th>
              <th className="text-left px-3 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Статус</th>
              <th className="text-center px-3 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Стоимость</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : data && data.results.length > 0 ? (
              data.results.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  Нет данных за выбранный период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {data.count > 0
              ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, data.count)} из ${data.count}`
              : ""}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground font-mono">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Row ────────────────────────────────────────────────── */

function HistoryRow({ entry }: { entry: CabinetHistoryEntry }) {
  const isGenerated = IS_GENERATED.has(entry.source_type);

  return (
    <tr className="hover:bg-muted/20 transition-colors group">
      {/* Date + Project */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <p className="text-[11px] font-mono text-muted-foreground">{formatDateTime(entry.created_at)}</p>
        {entry.project_name && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[120px]">{entry.project_name}</p>
        )}
      </td>

      {/* Source + Model */}
      <td className="px-3 py-2.5">
        <p className="text-foreground text-xs">
          {isGenerated ? (entry.ai_model_name ?? "—") : "Загрузка"}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {entry.element_type === "IMAGE" ? "Фото" : "Видео"}
          {!isGenerated && entry.file_size ? ` · ${formatStorage(entry.file_size)}` : ""}
        </p>
      </td>

      {/* Prompt (copyable) */}
      <td className="px-3 py-2.5 max-w-[280px]">
        {entry.prompt_text ? (
          <PromptCell text={entry.prompt_text} />
        ) : (
          <span className="text-muted-foreground/40 text-[11px]">—</span>
        )}
      </td>

      {/* Result — handles: image, video, processing, failed, no result */}
      <td className="px-3 py-2.5">
        <ResultCell entry={entry} />
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold ${STATUS_STYLES[entry.status] ?? "bg-muted text-muted-foreground"}`}>
          {entry.status_display}
        </span>
      </td>

      {/* Cost */}
      <td className="px-3 py-2.5 text-center">
        {entry.generation_cost && parseFloat(entry.generation_cost) > 0 ? (
          <span className="font-mono text-foreground">{formatCurrency(entry.generation_cost)}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
    </tr>
  );
}

/* ── Prompt Cell with Copy ──────────────────────────────── */

function PromptCell({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Промпт скопирован");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-1.5 group/prompt">
      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1" title={text}>
        {text}
      </p>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1 rounded opacity-0 group-hover/prompt:opacity-100 hover:bg-muted transition-all mt-[-1px]"
        title="Скопировать промпт"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

/* ── Result Cell — handles all edge cases ────────────────── */

function ResultCell({ entry }: { entry: CabinetHistoryEntry }) {
  const hasThumbnail = !!entry.thumbnail_url?.trim();
  const isVideo = entry.element_type === "VIDEO";

  /* COMPLETED with thumbnail → show clickable preview */
  if (entry.status === "COMPLETED" && hasThumbnail) {
    return (
      <ResultPreview
        thumbnailUrl={entry.thumbnail_url}
        fileUrl={entry.file_url}
        isVideo={isVideo}
      />
    );
  }

  /* PROCESSING / PENDING / UPLOADING → spinner */
  if (entry.status === "PROCESSING" || entry.status === "PENDING" || entry.status === "UPLOADING") {
    return (
      <div className="h-10 w-10 rounded-md bg-muted/40 flex items-center justify-center">
        <Loader2 className="h-4 w-4 text-muted-foreground/50 animate-spin" />
      </div>
    );
  }

  /* FAILED → error icon */
  if (entry.status === "FAILED") {
    return (
      <div className="h-10 w-10 rounded-md bg-destructive/5 flex items-center justify-center" title={entry.error_message || "Ошибка генерации"}>
        <AlertCircle className="h-4 w-4 text-destructive/50" />
      </div>
    );
  }

  /* COMPLETED but no thumbnail (shouldn't happen often) / fallback */
  return (
    <div className="h-10 w-10 rounded-md bg-muted/40 flex items-center justify-center">
      {isVideo ? (
        <Film className="h-4 w-4 text-muted-foreground/40" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
      )}
    </div>
  );
}

/* ── Result Preview Popover with Download ────────────────── */

function ResultPreview({ thumbnailUrl, fileUrl, isVideo }: { thumbnailUrl: string; fileUrl: string; isVideo: boolean }) {
  const handleDownload = () => {
    const url = fileUrl?.trim() || thumbnailUrl;
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    const filenameFromUrl = url.split("/").pop() || "file";
    anchor.download = filenameFromUrl.split("?")[0];
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative block h-10 w-10 rounded-md overflow-hidden bg-muted/40 hover:ring-1 hover:ring-primary/40 transition-all cursor-pointer">
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Film className="h-3.5 w-3.5 text-white/80" />
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-auto p-0 border-border bg-popover overflow-hidden"
        sideOffset={8}
      >
        <div className="relative group/preview">
          {isVideo && fileUrl?.trim() ? (
            <video
              src={fileUrl}
              controls
              className="max-w-[400px] max-h-[320px] rounded-md"
              poster={thumbnailUrl}
            />
          ) : (
            <img
              src={thumbnailUrl}
              alt=""
              className="max-w-[320px] max-h-[320px] rounded-md object-contain"
            />
          )}
          <button
            onClick={handleDownload}
            className="absolute bottom-2 right-2 p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border text-foreground hover:bg-background transition-colors opacity-0 group-hover/preview:opacity-100"
            title="Скачать оригинал"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
