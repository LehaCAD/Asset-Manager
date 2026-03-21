const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидание",
  PROCESSING: "В работе",
  COMPLETED: "Готово",
  FAILED: "Ошибка",
  DRAFT: "Черновик",
  IN_PROGRESS: "В работе",
  REVIEW: "На проверке",
  APPROVED: "Утверждено",
  ACTIVE: "Активен",
  PAUSED: "На паузе",
};

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function formatSceneCount(n: number): string {
  return pluralize(n, "группа", "группы", "групп");
}

export function formatElementCount(n: number): string {
  return pluralize(n, "элемент", "элемента", "элементов");
}

export function formatStorage(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
}

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num) || num === 0) return "0";
  return parseFloat(num.toFixed(2)).toString();
}
