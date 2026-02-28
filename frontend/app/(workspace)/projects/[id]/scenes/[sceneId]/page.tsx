interface SceneWorkspacePageProps {
  params: Promise<{ id: string; sceneId: string }>;
}

export default async function SceneWorkspacePage({ params }: SceneWorkspacePageProps) {
  const { id, sceneId } = await params;
  return (
    <main className="flex h-screen flex-col">
      <p className="text-muted-foreground p-8">
        Рабочее пространство сцены {sceneId} (проект {id}) — Phase 6
      </p>
    </main>
  );
}
