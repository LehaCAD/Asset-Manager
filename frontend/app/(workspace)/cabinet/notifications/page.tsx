"use client";

import { BellOff } from "lucide-react";

const TABS = ["Все", "Комментарии", "Генерации"];

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Уведомления</h1>

      {/* Tabs (disabled) */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              i === 0
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground cursor-not-allowed"
            }`}
            disabled={i > 0}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="rounded-full bg-muted p-4">
          <BellOff className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Пока тихо</p>
          <p className="text-xs text-muted-foreground max-w-[300px]">
            Уведомления появятся когда будет подключён шеринг проектов и комментарии от клиентов.
          </p>
        </div>
      </div>
    </div>
  );
}
