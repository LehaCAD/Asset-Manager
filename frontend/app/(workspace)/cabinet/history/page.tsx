"use client";

import { useEffect, useState, useCallback } from "react";
import { getHistory } from "@/lib/api/cabinet";
import { formatDateTime, formatStorage, formatCurrency } from "@/lib/utils/format";
import type { CabinetHistoryEntry, PaginatedResponse, AIModel } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUSES = [
  { value: "", label: "Все статусы" },
  { value: "COMPLETED", label: "Готово" },
  { value: "FAILED", label: "Ошибка" },
  { value: "PROCESSING", label: "Обработка" },
  { value: "PENDING", label: "Ожидание" },
];

const TYPES = [
  { value: "", label: "Все типы" },
  { value: "IMAGE", label: "Изображения" },
  { value: "VIDEO", label: "Видео" },
];

const SOURCES = [
  { value: "", label: "Все источники" },
  { value: "GENERATED", label: "Генерация" },
  { value: "UPLOADED", label: "Загрузка" },
  { value: "IMG2VID", label: "Image→Video" },
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-500/10 text-green-500",
  FAILED: "bg-destructive/10 text-destructive",
  PROCESSING: "bg-yellow-500/10 text-yellow-500",
  PENDING: "bg-muted text-muted-foreground",
  UPLOADING: "bg-blue-500/10 text-blue-500",
};

export default function HistoryPage() {
  const [data, setData] = useState<PaginatedResponse<CabinetHistoryEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [elementType, setElementType] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [modelId, setModelId] = useState<number | undefined>();
  const [models, setModels] = useState<AIModel[]>([]);

  useEffect(() => {
    apiClient.get("/api/ai-models/").then((r) => setModels(r.data));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getHistory({
      page,
      status: status || undefined,
      element_type: elementType || undefined,
      source_type: sourceType || undefined,
      ai_model_id: modelId,
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, status, elementType, sourceType, modelId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [status, elementType, sourceType, modelId]);

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Журнал генераций</h1>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter options={STATUSES} value={status} onChange={setStatus} />
        <Filter options={TYPES} value={elementType} onChange={setElementType} />
        <Filter options={SOURCES} value={sourceType} onChange={setSourceType} />
        <select
          value={modelId ?? ""}
          onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
        >
          <option value="">Все модели</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Дата</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Тип</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Модель</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-[200px]">Промпт</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Статус</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Стоимость</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Размер</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Проект</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : data && data.results.length > 0 ? (
              data.results.map((entry) => (
                <tr key={entry.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-muted-foreground">
                      {entry.element_type === "IMAGE" ? "Фото" : "Видео"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{entry.ai_model_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate" title={entry.prompt_text}>
                    {entry.prompt_text || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[entry.status] ?? ""}`}>
                      {entry.status_display}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {entry.generation_cost && parseFloat(entry.generation_cost) > 0
                      ? `${formatCurrency(entry.generation_cost)} ⚡`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {entry.file_size ? formatStorage(entry.file_size) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{entry.project_name ?? "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  Нет данных
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">
            {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Filter({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
