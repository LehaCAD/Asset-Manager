"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/lib/store/projects";

interface Crumb {
  label: string;
  href?: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Проекты" }];
  if (segments[0] !== "projects") return [];
  
  const isInScene = segments[2] === "scenes" && segments[3];
  const crumbs: Crumb[] = [{ label: "Проекты", href: "/projects" }];
  
  if (segments[1]) {
    // Если мы в сцене, проект должен быть кликабельной ссылкой
    // Поэтому не делаем его последним элементом
    crumbs.push({ label: "Проект", href: `/projects/${segments[1]}` });
  }
  
  if (crumbs.length === 1) {
    crumbs[0] = { label: "Проекты" };
  }
  return crumbs;
}

interface BreadcrumbsProps {
  projectName?: string;
  sceneName?: string;
  suffix?: string;
}

export function Breadcrumbs({ projectName, sceneName, suffix }: BreadcrumbsProps) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  const projects = useProjectsStore((s) => s.projects);
  const segments = pathname.split("/").filter(Boolean);
  const projectIdFromUrl = segments[0] === "projects" && segments[1] ? Number(segments[1]) : null;
  const projectNameFromStore = projectIdFromUrl
    ? projects.find((p) => p.id === projectIdFromUrl)?.name
    : null;
  const displayProjectName = projectName ?? projectNameFromStore;
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Навигация" className="flex items-center gap-1 text-sm min-w-0">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        let label = crumb.label;
        if (index === 1 && displayProjectName) {
          label = `Проект «${displayProjectName}»`;
        } else if (index === 1) {
          label = "Проект";
        }
        // Убрано отображение сцены в хлебных крошках
        // if (isLast && index === 2 && sceneName) {
        //   label = `Сцена «${sceneName}»`;
        // } else if (isLast && index === 2) {
        //   label = "Сцена";
        // }
        // В сцене проект должен быть кликабельным (даже если isLast)
        const isInScene = pathname.includes("/scenes/");
        const isProject = index === 1;
        const shouldBeLink = crumb.href && (!isLast || (isInScene && isProject));
        
        return (
          <span key={index} className="flex items-center gap-1 min-w-0">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
            {shouldBeLink && crumb.href ? (
              <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[300px]">
                {label}
              </Link>
            ) : (
              <span className={cn("truncate max-w-[300px]", isLast ? "text-foreground font-medium" : "text-muted-foreground")}>
                {label}
              </span>
            )}
          </span>
        );
      })}
      {suffix && <span className="text-muted-foreground ml-1">{suffix}</span>}
    </nav>
  );
}
