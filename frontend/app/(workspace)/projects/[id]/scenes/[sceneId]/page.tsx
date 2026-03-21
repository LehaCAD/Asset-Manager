import { redirect } from 'next/navigation';

interface SceneRedirectProps {
  params: Promise<{ id: string; sceneId: string }>;
}

export default async function SceneRedirect({ params }: SceneRedirectProps) {
  const { id, sceneId } = await params;
  redirect(`/projects/${id}/groups/${sceneId}`);
}
