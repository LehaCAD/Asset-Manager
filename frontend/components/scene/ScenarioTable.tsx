"use client";

import { useEffect, useState } from "react";
import { projectsApi } from "@/lib/api/projects";
import { SceneGrid } from "./SceneGrid";
import type { Project } from "@/lib/types";

interface ScenarioTableProps {
  projectId: number;
}

export function ScenarioTable({ projectId }: ScenarioTableProps) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    projectsApi.getById(projectId).then(setProject).catch(() => null);
  }, [projectId]);

  return (
    <SceneGrid
      projectId={projectId}
      projectName={project?.name}
    />
  );
}
