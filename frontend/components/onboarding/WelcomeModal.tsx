"use client";

import { useOnboardingStore } from "@/lib/store/onboarding";
import { useCreditsStore } from "@/lib/store/credits";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Clapperboard, FolderPlus, WandSparkles, Image } from "lucide-react";

export function WelcomeModal() {
  const welcomeSeen = useOnboardingStore((s) => s.welcomeSeen);
  const isLoaded = useOnboardingStore((s) => s.isLoaded);
  const markWelcomeSeen = useOnboardingStore((s) => s.markWelcomeSeen);
  const balance = useCreditsStore((s) => s.balance);

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
            <h2 className="text-xl font-semibold text-white">
              Добро пожаловать в Раскадровку
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Ваш инструмент для AI-продакшена
            </p>
          </div>

          {/* Bonus card */}
          <div
            className="rounded-lg p-3 mb-5 text-center"
            style={{
              background: "rgba(139, 124, 247, 0.1)",
              border: "1px solid rgba(139, 124, 247, 0.3)",
            }}
          >
            <p className="text-sm text-zinc-300">Ваш стартовый баланс</p>
            <p
              className="text-2xl font-bold mt-1"
              style={{ color: "#8B7CF7" }}
            >
              {balance} кадров
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-6">
            {[
              {
                icon: FolderPlus,
                text: "Создайте проект и добавьте первую группу",
              },
              {
                icon: WandSparkles,
                text: "Напишите промпт — нейросеть создаст изображение",
              },
              {
                icon: Image,
                text: "Просматривайте, скачивайте, делитесь результатами",
              },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(139, 124, 247, 0.15)" }}
                >
                  <Icon size={16} color="#8B7CF7" />
                </div>
                <span className="text-sm text-zinc-300">{text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => markWelcomeSeen()}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm"
            style={{
              background: "linear-gradient(135deg, #8B7CF7, #6B5CE7)",
            }}
          >
            Начать
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
