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

  const crumbs: Crumb[] = [{ label: "Проекты", href: "/projects" }];

  if (segments[1]) {
    crumbs.push({ label: "Проект", href: `/projects/${segments[1]}` });
  }

  if (segments[2] === "scenes" && segments[3]) {
    crumbs.push({ label: "Сцена" });
  }

  if (crumbs.length === 1) {
    // Only "Проекты" and we're on /projects — no href needed
    crumbs[0] = { label: "Проекты" };
  }

  return crumbs;
}

interface BreadcrumbsProps {
  projectName?: string;
  sceneName?: string;
}

export function Breadcrumbs({ projectName, sceneName }: BreadcrumbsProps) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  const projects = useProjectsStore((s) => s.projects);

  const segments = pathname.split("/").filter(Boolean);
  const projectIdFromUrl = segments[0] === "projects" && segments[1] ? Number(segments[1]) : null;
  const projectNameFromStore = projectIdFromUrl
    ? projects.find((p) => p.id === projectIdFromUrl)?.name
    : null;

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Навигация по разделам"
      className="flex items-center gap-1 text-sm min-w-0"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;

        let label = crumb.label;
        if (index === 1) label = projectName ?? projectNameFromStore ?? crumb.label;
        if (isLast && index === 2 && sceneName) label = sceneName;

        return (
          <span key={index} className="flex items-center gap-1 min-w-0">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors duration-150 truncate max-w-[200px]"
              >
                {label}
              </Link>
            ) : (
              <span
                className={cn(
                  "truncate max-w-[200px]",
                  isLast
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
