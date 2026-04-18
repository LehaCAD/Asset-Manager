"use client";

import { FolderOpen, Share2, Layers, Wand } from "lucide-react";

const features = [
  {
    icon: FolderOpen,
    title: "Создавайте проекты",
    description:
      "Организуйте работу в проектах — от идеи до финального результата",
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-400",
  },
  {
    icon: Share2,
    title: "Делитесь с командой",
    description:
      "Отправляйте ссылки на проекты коллегам и заказчикам для ревью",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
  },
  {
    icon: Layers,
    title: "Объединяйте в группы",
    description:
      "Собирайте элементы в смысловые группы для удобной навигации",
    iconBg: "bg-pink-500/10",
    iconColor: "text-pink-400",
  },
  {
    icon: Wand,
    title: "Генерируйте с AI",
    description:
      "Создавайте изображения и видео с помощью передовых нейросетей",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
  },
];

export function AuthShowcase() {
  return (
    <div
      className="hidden lg:flex lg:flex-1 flex-col relative overflow-hidden justify-center py-14 gap-8"
      style={{
        background:
          "linear-gradient(135deg, #1A0C35 0%, #0F0A20 50%, #0A1628 100%)",
        /* Плавные паддинги вместо ступенчатых брейкпоинтов */
        paddingLeft: "clamp(48px, 4vw, 80px)",
        paddingRight: "clamp(48px, 4vw, 80px)",
      }}
      aria-hidden="true"
    >
      {/* Glow orbs */}
      <div className="absolute top-[-50px] left-[100px] w-[500px] h-[500px] rounded-full bg-purple-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-50px] right-[50px] w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      {/* Headline — плавный размер через clamp */}
      <div className="relative z-10 space-y-4">
        <h2
          className="font-extrabold leading-[1.1] tracking-tight text-white"
          style={{ fontSize: "clamp(32px, 3vw, 48px)" }}
        >
          Всё для вашего{" "}
          <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
            AI-продакшена
          </span>
        </h2>
        <p className="text-[16px] leading-relaxed text-[#A0AEC0] max-w-lg">
          Мощные инструменты для создания визуального контента
        </p>
      </div>

      {/* Gradient divider */}
      <div
        className="relative z-10 h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(124,58,237,0.25) 30%, rgba(59,130,246,0.25) 70%, transparent 100%)",
        }}
      />

      {/* Feature grid 2×2 */}
      <div className="relative z-10 grid grid-cols-2 gap-5">
        {features.map((f) => (
          <div
            key={f.title}
            className="flex flex-col gap-3.5 rounded-2xl border border-white/[0.04] bg-[#161622]/60 p-5 backdrop-blur-sm"
          >
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.iconBg}`}
            >
              <f.icon className={`h-[22px] w-[22px] ${f.iconColor}`} />
            </div>
            <h3 className="text-[15px] font-bold text-white">{f.title}</h3>
            <p className="text-[13px] leading-relaxed text-[#8B8BA3]">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
