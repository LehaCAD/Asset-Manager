import WorkspaceContainer from '@/components/element/WorkspaceContainer';

interface GroupWorkspacePageProps {
  params: Promise<{ id: string; groupId: string }>;
}

export default async function GroupWorkspacePage({ params }: GroupWorkspacePageProps) {
  const { id, groupId } = await params;

  return <WorkspaceContainer projectId={Number(id)} groupId={Number(groupId)} />;
}
