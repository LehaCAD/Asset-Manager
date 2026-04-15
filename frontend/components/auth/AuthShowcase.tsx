"use client";

import { FloatingField } from "./FloatingField";

export function AuthShowcase() {
  return (
    <div
      className="dark hidden lg:flex lg:w-1/2 flex-col bg-[#111827] relative overflow-hidden"
      aria-hidden="true"
    >
      {/* Hero block — top ~33% */}
      <div
        className="relative z-10 flex flex-col justify-end px-10 pt-12 pb-6"
        style={{ minHeight: "33%" }}
      >
        <h2 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#EFF1F5]">
          Собирайте{" "}
          <span className="bg-gradient-to-r from-[#8B7CF7] to-[#c084fc] bg-clip-text text-transparent">
            визуальные истории
          </span>
          <br />
          вместе с командой
        </h2>
        <p className="mt-2 max-w-[380px] text-[13px] leading-relaxed text-[#8B8FA3]">
          Проекты, AI-генерация, шеринг и согласования — всё в одном пространстве
        </p>
      </div>

      {/* Floating field — bottom ~67% */}
      <FloatingField />
    </div>
  );
}
