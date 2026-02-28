interface PublicSharePageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicSharePage({ params }: PublicSharePageProps) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-background">
      <p className="text-muted-foreground p-8">Публичная раскадровка {token} — Phase 9</p>
    </main>
  );
}
