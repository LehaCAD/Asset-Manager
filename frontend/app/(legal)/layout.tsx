import Link from "next/link";
import { Clapperboard } from "lucide-react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-14 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Clapperboard className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Раскадровка</span>
        </Link>
      </div>
      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
    </div>
  );
}
