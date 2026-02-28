import Link from "next/link";
import { Clapperboard } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex h-14 items-center px-6">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Clapperboard className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Раскадровка</span>
        </Link>
      </div>
      <main className="flex flex-1 items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}
