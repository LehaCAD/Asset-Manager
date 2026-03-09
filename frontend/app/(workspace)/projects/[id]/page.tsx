import { ScenarioTableClient } from "@/components/scene/ScenarioTableClient";

interface ScenarioTablePageProps {
  params: Promise<{ id: string }>;
}

export default async function ScenarioTablePage({ params }: ScenarioTablePageProps) {
  const { id } = await params;
  const projectId = Number(id);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <ScenarioTableClient projectId={projectId} />
    </div>
  );
}
