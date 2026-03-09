import { SceneWorkspace } from "@/components/element/SceneWorkspace";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";

interface SceneWorkspacePageProps {
  params: Promise<{ id: string; sceneId: string }>;
}

export default async function SceneWorkspacePage({ params }: SceneWorkspacePageProps) {
  const { id, sceneId } = await params;
  const projectId = Number(id);
  const sceneIdNum = Number(sceneId);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Workspace Header - breadcrumbs + scene name/count */}
      <WorkspaceHeader projectId={projectId} sceneId={sceneIdNum} />
      
      {/* Scene Workspace - filters + grid + promptbar */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SceneWorkspace projectId={projectId} sceneId={sceneIdNum} />
      </div>
    </div>
  );
}
