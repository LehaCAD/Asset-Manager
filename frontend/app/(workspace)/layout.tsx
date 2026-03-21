import { AuthGuard } from "@/components/layout/AuthGuard";
import { Navbar } from "@/components/layout/Navbar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <Navbar />
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </div>
    </AuthGuard>
  );
}
