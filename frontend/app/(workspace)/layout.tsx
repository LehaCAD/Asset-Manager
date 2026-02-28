import { AuthGuard } from "@/components/layout/AuthGuard";
import { Navbar } from "@/components/layout/Navbar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex-1">{children}</main>
      </div>
    </AuthGuard>
  );
}
