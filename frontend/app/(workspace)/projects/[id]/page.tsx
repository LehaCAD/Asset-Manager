import { ScenarioTable } from "@/components/scene/ScenarioTable";

interface ScenarioTablePageProps {
  params: Promise<{ id: string }>;
}

export default async function ScenarioTablePage({ params }: ScenarioTablePageProps) {
  const { id } = await params;
  return <ScenarioTable projectId={Number(id)} />;
}
