import { AuthShowcase } from "@/components/auth/AuthShowcase";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark flex min-h-screen bg-[#0A0A12] text-foreground">
      {/* Left — form panel, fixed 520px on desktop */}
      <div className="relative flex w-full flex-col items-center lg:items-stretch lg:w-[520px] shrink-0">
        <div className="flex w-full max-w-[520px] flex-1 flex-col lg:max-w-none">
          {children}
        </div>

        {/* Accent line — right edge, desktop only */}
        <div
          className="absolute right-0 top-[60px] bottom-[60px] hidden w-[3px] rounded-full lg:block"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(124,58,237,0.35) 30%, rgba(91,33,182,0.35) 70%, transparent 100%)",
          }}
        />
      </div>

      {/* Right — showcase panel */}
      <AuthShowcase />
    </div>
  );
}
