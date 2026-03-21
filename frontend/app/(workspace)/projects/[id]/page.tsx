import WorkspaceContainer from '@/components/element/WorkspaceContainer';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;

  return <WorkspaceContainer projectId={Number(id)} />;
}
