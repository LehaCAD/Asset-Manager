"use client";

import { useOnboardingStore } from "@/lib/store/onboarding";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Clapperboard, FolderPlus, Pencil, Image, Trophy } from "lucide-react";

export function WelcomeModal() {
  const welcomeSeen = useOnboardingStore((s) => s.welcomeSeen);
  const isLoaded = useOnboardingStore((s) => s.isLoaded);
  const markWelcomeSeen = useOnboardingStore((s) => s.markWelcomeSeen);

  if (!isLoaded || welcomeSeen) return null;

  return (
    <Dialog open={true} onOpenChange={() => markWelcomeSeen()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md p-0 overflow-hidden border-0"
        style={{
          background: "#1C1C1E",
          borderRadius: "16px",
          boxShadow: "0 0 60px rgba(139, 124, 247, 0.2)",
        }}
      >
        {/* Accent top bar */}
        <div
          style={{
            height: "4px",
            background: "linear-gradient(90deg, #8B7CF7, #6B5CE7)",
          }}
        />

        <div className="p-6">
          {/* Icon + heading */}
          <div className="flex flex-col items-center text-center mb-6">
            <Clapperboard size={40} color="#8B7CF7" className="mb-3" />
            <DialogTitle className="text-xl font-semibold text-white">
              Добро пожаловать в Раскадровку
            </DialogTitle>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-5">
            {[
              {
                icon: FolderPlus,
                text: "Создайте проект — пространство для ваших идей",
              },
              {
                icon: Image,
                text: "Генерируйте картинки и видео или загружайте свои файлы",
              },
              {
                icon: Pencil,
                text: "Собирайте в группы и делитесь с командой",
              },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "rgba(139, 124, 247, 0.15)", color: "#8B7CF7" }}
                >
                  {i + 1}
                </div>
                <span className="text-sm text-zinc-300">{text}</span>
              </div>
            ))}
          </div>

          {/* Achievement hint */}
          <div
            className="rounded-xl px-4 py-3.5 mb-5 flex items-center justify-center gap-3"
            style={{
              background: "rgba(255, 215, 0, 0.06)",
              border: "1px solid rgba(255, 215, 0, 0.15)",
            }}
          >
            <Trophy size={24} color="#FFD700" className="shrink-0" />
            <p className="text-[13px] text-zinc-400 leading-snug">
              За первые шаги начисляются бонусные кадры
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => markWelcomeSeen()}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm"
            style={{
              background: "linear-gradient(135deg, #8B7CF7, #6B5CE7)",
            }}
          >
            Начать работу
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
