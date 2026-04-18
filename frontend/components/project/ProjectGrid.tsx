"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ReviewsOverlay } from "@/components/sharing/ReviewsOverlay";
import { TierBadge } from "@/components/subscription/TierBadge";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { useProjectsStore } from "@/lib/store/projects";
import { useAuthStore } from "@/lib/store/auth";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { OnboardingEmptyState } from "@/components/onboarding/OnboardingEmptyState";
import { useNotificationStore } from "@/lib/store/notifications";

export function ProjectGrid() {
  const router = useRouter();
  const { projects, isLoading, loadProjects } = useProjectsStore();
  const user = useAuthStore((s) => s.user);
  const getAnyTaskForPage = useOnboardingStore((s) => s.getAnyTaskForPage);
  const onboardingTasks = useOnboardingStore((s) => s.tasks);
  const quota = user?.quota;
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const feedbackUnread = useNotificationStore((s) => s.feedbackUnreadCount);

  const isAtProjectLimit = quota
    ? quota.max_projects > 0 && quota.used_projects >= quota.max_projects
    : false;

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header — two rows on mobile, single row on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-center border-b px-4 py-2 gap-2 bg-surface shrink-0">
        {/* Row 1: title + count */}
        <div className="flex items-center">
          <span className="text-sm text-foreground font-medium">Проекты</span>
          {!isLoading && (
            <span className="text-sm text-muted-foreground ml-2">
              · {quota && quota.max_projects > 0
                ? `${projects.length} / ${quota.max_projects}`
                : `${projects.length} ${projectsLabel(projects.length)}`}
            </span>
          )}
        </div>
        {/* Row 2: actions — CTA + reviews */}
        <div className="flex items-center gap-2 sm:ml-3 sm:flex-1">
          <button
            type="button"
            onClick={() => isAtProjectLimit ? setUpgradeOpen(true) : setCreateOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-primary bg-card hover:bg-card/80 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Создать проект
            {isAtProjectLimit && <TierBadge tier="plus" />}
          </button>
          <button
            type="button"
            onClick={() => setReviewsOpen(!reviewsOpen)}
            className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors shrink-0 sm:ml-auto"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Отзывы</span>
            {feedbackUnread > 0 && !reviewsOpen && (
              <span className="bg-primary text-white text-[10px] font-bold rounded px-1.5 py-0.5 min-w-[18px] text-center">
                {feedbackUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Grid - full width, no max-width */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {isLoading ? (
            <div className="grid grid-mobile-1 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            getAnyTaskForPage('projects')
              ? <OnboardingEmptyState task={getAnyTaskForPage('projects')!} onAction={() => setCreateOpen(true)} />
              : <EmptyState onCreateClick={() => setCreateOpen(true)} />
          ) : (
            (() => {
              const createProjectDone = onboardingTasks.find(t => t.code === 'create_project')?.completed;
              const createSceneDone = onboardingTasks.find(t => t.code === 'create_scene')?.completed;
              const shouldHint = createProjectDone && !createSceneDone && projects.length >= 1;
              const newestId = shouldHint
                ? [...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id
                : null;
              return (
                <div className="grid grid-mobile-1 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      highlight={project.id === newestId}
                    />
                  ))}
                </div>
              );
            })()
          )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitTitle="Проекты"
        limitUsed={quota?.used_projects}
        limitMax={quota?.max_projects}
      />

      <ReviewsOverlay
        isOpen={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
        onOpenLightbox={(elementId, sceneId, elProjectId) => {
          setReviewsOpen(false)
          if (sceneId) {
            router.push(`/projects/${elProjectId}/groups/${sceneId}?lightbox=${elementId}`)
          } else {
            router.push(`/projects/${elProjectId}?lightbox=${elementId}`)
          }
        }}
      />
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="aspect-video p-1.5">
        <Skeleton className="w-full h-full rounded-md" />
      </div>
      <div className="p-3 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-6">
        <FolderOpen className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Нет проектов</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Создайте свой первый проект, чтобы начать работу с раскадровками.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4 mr-2" />
        Создать проект
      </Button>
    </div>
  );
}

function projectsLabel(count: number): string {
  if (count === 1) return "проект";
  if (count >= 2 && count <= 4) return "проекта";
  return "проектов";
}
