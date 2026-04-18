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
        className="max-w-md p-0 overflow-hidden border border-border bg-card rounded-2xl shadow-[0_0_60px_rgba(139,124,247,0.2)]"
      >
        {/* Accent top bar */}
        <div className="h-1 bg-gradient-to-r from-primary to-[oklch(0.72_0.17_281)]" />

        <div className="p-6">
          {/* Icon + heading */}
          <div className="flex flex-col items-center text-center mb-6">
            <Clapperboard size={40} className="mb-3 text-primary" />
            <DialogTitle className="text-xl font-semibold text-foreground">
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
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-primary/15 text-primary">
                  {i + 1}
                </div>
                <span className="text-sm text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>

          {/* Achievement hint */}
          <div className="rounded-xl px-4 py-3.5 mb-5 flex items-center justify-center gap-3 bg-warning/10 border border-warning/30">
            <Trophy size={24} className="shrink-0 text-warning" />
            <p className="text-[13px] text-muted-foreground leading-snug">
              За первые шаги начисляются бонусные кадры
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => markWelcomeSeen()}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-br from-primary to-[oklch(0.48_0.19_281)] hover:brightness-110 transition-all"
          >
            Начать работу
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
