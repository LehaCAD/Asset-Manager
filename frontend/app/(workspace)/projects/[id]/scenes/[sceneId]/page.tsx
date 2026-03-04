import { SceneWorkspace } from "@/components/element/SceneWorkspace";

interface SceneWorkspacePageProps {
  params: Promise<{ id: string; sceneId: string }>;
}

export default async function SceneWorkspacePage({ params }: SceneWorkspacePageProps) {
  const { id, sceneId } = await params;
  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <SceneWorkspace
        projectId={Number(id)}
        sceneId={Number(sceneId)}
      />
    </main>
  );
}
