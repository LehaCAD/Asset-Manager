import { AuthGuard } from "@/components/layout/AuthGuard";

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </div>
    </AuthGuard>
  );
}
