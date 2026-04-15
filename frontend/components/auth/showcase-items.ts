export interface ShowcaseItemConfig {
  id: string;
  type:
    | "project-card"
    | "element-card"
    | "group-card"
    | "comment"
    | "reaction-group"
    | "share-badge"
    | "status-badge"
    | "notification"
    | "chat-bubble"
    | "review-pill";
  /** Position as % of container (0-100) */
  x: number;
  y: number;
  width: number;
  float: {
    amplitudeX: number;
    amplitudeY: number;
    speedX: number;
    speedY: number;
  };
  content: Record<string, unknown>;
}

export const showcaseItems: ShowcaseItemConfig[] = [
  // ── Project Cards ──
  {
    id: "pc-1", type: "project-card", x: 3, y: 5, width: 220,
    float: { amplitudeX: 5, amplitudeY: 8, speedX: 0.4, speedY: 0.3 },
    content: { name: "Рекламный ролик", count: 12, time: "2 ч назад", statusColor: "#10b981",
      thumbs: [
        "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=400&fit=crop&q=80",
      ] },
  },
  {
    id: "pc-2", type: "project-card", x: 28, y: 2, width: 200,
    float: { amplitudeX: 4, amplitudeY: 6, speedX: 0.35, speedY: 0.25 },
    content: { name: "Презентация бренда", count: 8, time: "вчера", statusColor: "#3B82F6",
      thumbs: [
        "https://images.unsplash.com/photo-1611457194403-d3f8c5154dc4?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&h=400&fit=crop&q=80",
      ] },
  },
  {
    id: "pc-3", type: "project-card", x: 55, y: 8, width: 210,
    float: { amplitudeX: 6, amplitudeY: 7, speedX: 0.3, speedY: 0.35 },
    content: { name: "Сториборд к клипу", count: 24, time: "3 дня", statusColor: "#F59E0B",
      thumbs: [
        "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400&h=400&fit=crop&q=80",
      ] },
  },
  {
    id: "pc-4", type: "project-card", x: 78, y: 3, width: 195,
    float: { amplitudeX: 5, amplitudeY: 9, speedX: 0.45, speedY: 0.28 },
    content: { name: "Концепт-арт игры", count: 32, time: "5 дней", statusColor: "#8B7CF7",
      thumbs: [
        "https://images.unsplash.com/photo-1580477667995-2b94f01c9516?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1513360371669-4adf264d5f30?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&h=400&fit=crop&q=80",
      ] },
  },

  // ── Element Cards ──
  {
    id: "ec-1", type: "element-card", x: 5, y: 45, width: 140,
    float: { amplitudeX: 4, amplitudeY: 7, speedX: 0.35, speedY: 0.4 },
    content: { image: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=400&h=400&fit=crop&q=80",
      badge: "VIDEO", comments: 3, filename: "scene_01.mp4", approval: "approved" },
  },
  {
    id: "ec-2", type: "element-card", x: 22, y: 40, width: 130,
    float: { amplitudeX: 5, amplitudeY: 6, speedX: 0.4, speedY: 0.35 },
    content: { image: "https://images.unsplash.com/photo-1611457194403-d3f8c5154dc4?w=400&h=400&fit=crop&q=80",
      badge: "IMAGE", comments: 0, filename: "hero_bg.png", approval: "progress" },
  },
  {
    id: "ec-3", type: "element-card", x: 42, y: 48, width: 135,
    float: { amplitudeX: 3, amplitudeY: 8, speedX: 0.3, speedY: 0.38 },
    content: { image: "https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400&h=400&fit=crop&q=80",
      badge: "IMAGE", comments: 7, filename: "mood_03.png", approval: "approved" },
  },
  {
    id: "ec-4", type: "element-card", x: 65, y: 42, width: 125,
    float: { amplitudeX: 6, amplitudeY: 5, speedX: 0.38, speedY: 0.32 },
    content: { image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&h=400&fit=crop&q=80",
      badge: "IMAGE", comments: 0 },
  },
  {
    id: "ec-5", type: "element-card", x: 82, y: 45, width: 130,
    float: { amplitudeX: 4, amplitudeY: 7, speedX: 0.42, speedY: 0.3 },
    content: { image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=400&h=400&fit=crop&q=80",
      badge: "VIDEO", comments: 2 },
  },

  // ── Group Cards (stacked) ──
  {
    id: "gc-1", type: "group-card", x: 50, y: 30, width: 170,
    float: { amplitudeX: 4, amplitudeY: 6, speedX: 0.3, speedY: 0.35 },
    content: { name: "Мудборд интерьера", groups: 4, count: 20,
      thumbs: [
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&h=400&fit=crop&q=80",
        "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&h=400&fit=crop&q=80",
      ] },
  },

  // ── Comments ──
  {
    id: "cm-1", type: "comment", x: 15, y: 28, width: 200,
    float: { amplitudeX: 3, amplitudeY: 5, speedX: 0.25, speedY: 0.3 },
    content: { name: "Мария", initial: "М", color: "from-amber-500 to-red-500",
      text: "Второй кадр идеален, берём в работу 🔥", time: "2 мин" },
  },
  {
    id: "cm-2", type: "comment", x: 60, y: 22, width: 190,
    float: { amplitudeX: 4, amplitudeY: 4, speedX: 0.3, speedY: 0.25 },
    content: { name: "Алексей", initial: "А", color: "from-[#6C5CE7] to-[#a78bfa]",
      text: "Согласовано ✅ Отправляю клиенту", time: "5 мин" },
  },
  {
    id: "cm-3", type: "comment", x: 35, y: 70, width: 180,
    float: { amplitudeX: 5, amplitudeY: 6, speedX: 0.28, speedY: 0.33 },
    content: { name: "Дима", initial: "Д", color: "from-emerald-500 to-green-400",
      text: "Можно чуть теплее тон?", time: "12 мин" },
  },
  {
    id: "cm-4", type: "comment", x: 70, y: 68, width: 185,
    float: { amplitudeX: 3, amplitudeY: 5, speedX: 0.32, speedY: 0.28 },
    content: { name: "Катя", initial: "К", color: "from-pink-500 to-rose-400",
      text: "Палитра огонь, именно это хотели 💜", time: "1 ч" },
  },

  // ── Reactions ──
  {
    id: "rx-1", type: "reaction-group", x: 8, y: 62, width: 0,
    float: { amplitudeX: 3, amplitudeY: 4, speedX: 0.35, speedY: 0.4 },
    content: { reactions: [{ emoji: "🔥", count: 12 }, { emoji: "👍", count: 8 }, { emoji: "✅", count: 3 }] },
  },
  {
    id: "rx-2", type: "reaction-group", x: 48, y: 58, width: 0,
    float: { amplitudeX: 4, amplitudeY: 3, speedX: 0.4, speedY: 0.35 },
    content: { reactions: [{ emoji: "❤️", count: 5 }, { emoji: "💡", count: 2 }, { emoji: "🎯", count: 4 }] },
  },
  {
    id: "rx-3", type: "reaction-group", x: 82, y: 60, width: 0,
    float: { amplitudeX: 3, amplitudeY: 5, speedX: 0.38, speedY: 0.3 },
    content: { reactions: [{ emoji: "👏", count: 7 }, { emoji: "💜", count: 3 }] },
  },

  // ── Share/Status badges ──
  {
    id: "sb-1", type: "share-badge", x: 38, y: 15, width: 0,
    float: { amplitudeX: 3, amplitudeY: 4, speedX: 0.3, speedY: 0.35 },
    content: { label: "Ссылка отправлена", dotColor: "green" },
  },
  {
    id: "sb-2", type: "status-badge", x: 75, y: 32, width: 0,
    float: { amplitudeX: 4, amplitudeY: 3, speedX: 0.35, speedY: 0.3 },
    content: { label: "Генерация завершена", variant: "success" },
  },

  // ── Notifications ──
  {
    id: "nf-1", type: "notification", x: 5, y: 80, width: 210,
    float: { amplitudeX: 3, amplitudeY: 4, speedX: 0.25, speedY: 0.3 },
    content: { title: "Новый комментарий", desc: "Мария оставила отзыв к кадру #4", iconColor: "primary" },
  },
  {
    id: "nf-2", type: "notification", x: 55, y: 82, width: 200,
    float: { amplitudeX: 4, amplitudeY: 3, speedX: 0.3, speedY: 0.25 },
    content: { title: "Проект согласован", desc: "Все 3 участника одобрили", iconColor: "success" },
  },

  // ── Review pills ──
  {
    id: "rp-1", type: "review-pill", x: 30, y: 55, width: 0,
    float: { amplitudeX: 3, amplitudeY: 4, speedX: 0.3, speedY: 0.35 },
    content: { label: "Согласовано", variant: "approved" },
  },
  {
    id: "rp-2", type: "review-pill", x: 88, y: 72, width: 0,
    float: { amplitudeX: 4, amplitudeY: 3, speedX: 0.35, speedY: 0.3 },
    content: { label: "Правки", variant: "changes" },
  },
];
