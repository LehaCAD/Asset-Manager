'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/auth';
import { useProjectsStore } from '@/lib/store/projects';
import ProjectCard from '@/components/ProjectCard';
import NewItemSlot from '@/components/NewItemSlot';
import Modal from '@/components/ui/Modal';

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const {
    projects,
    projectsLoading,
    projectsError,
    fetchProjects,
    createProject,
  } = useProjectsStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    setCreateError('');
    try {
      await createProject(newName.trim(), aspectRatio);
      toast.success('Проект создан');
      setNewName('');
      setAspectRatio('16:9');
      setShowCreate(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка при создании';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt-primary">Мои проекты</h1>
          {user && user.quota && (
            <p className="mt-1 text-sm text-txt-muted">
              {user.quota.used_projects}/{user.quota.max_projects} {formatProjectCount(user.quota.max_projects)}
              {user.quota.used_projects >= user.quota.max_projects && (
                <span className="ml-2 text-red-500 font-medium">• Лимит достигнут</span>
              )}
            </p>
          )}
          {user && !user.quota && projects.length > 0 && (
            <p className="mt-1 text-sm text-txt-muted">
              {projects.length} {formatProjectCount(projects.length)}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (user?.quota && user.quota.used_projects >= user.quota.max_projects) {
              toast.error(`Достигнут лимит проектов (${user.quota.max_projects}). Обратитесь к администратору.`);
              return;
            }
            setNewName('');
            setAspectRatio('16:9');
            setCreateError('');
            setShowCreate(true);
          }}
          disabled={user?.quota ? user.quota.used_projects >= user.quota.max_projects : false}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            user?.quota && user.quota.used_projects >= user.quota.max_projects
              ? `Достигнут лимит проектов (${user.quota.max_projects})`
              : undefined
          }
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">Новый проект</span>
        </button>
      </div>

      {/* Loading state */}
      {projectsLoading && projects.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-surface-border">
              <div className="aspect-video skeleton" />
              <div className="p-3 bg-surface-secondary">
                <div className="h-4 w-3/4 skeleton mb-2" />
                <div className="h-3 w-1/2 skeleton" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {projectsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-600 text-sm">{projectsError}</p>
          <button
            onClick={fetchProjects}
            className="text-red-500 text-sm underline mt-2 hover:text-red-700"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {/* Empty state */}
      {!projectsLoading && !projectsError && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-surface-secondary flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-txt-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-txt-primary mb-2">Нет проектов</h3>
          <p className="text-sm text-txt-muted text-center max-w-sm mb-6">
            Создайте свой первый проект, чтобы начать работу с AI-генерацией контента
          </p>
          <button
            onClick={() => {
              setNewName('');
              setAspectRatio('16:9');
              setCreateError('');
              setShowCreate(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Создать проект
          </button>
        </div>
      )}

      {/* Projects grid */}
      {!projectsLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
          {/* New Project Slot */}
          {(!user?.quota || user.quota.used_projects < user.quota.max_projects) && (
            <NewItemSlot
              label="Новый проект"
              onClick={() => {
                setNewName('');
                setAspectRatio('16:9');
                setCreateError('');
                setShowCreate(true);
              }}
            />
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Новый проект">
        <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-txt-primary mb-2">Название проекта</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
                placeholder="Например: Рекламный ролик Nike"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-txt-primary mb-2">Формат кадров</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    aspectRatio === '16:9'
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-surface-border text-txt-secondary hover:border-accent/50 hover:bg-surface-secondary'
                  }`}
                >
                  Горизонтальный 16:9
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    aspectRatio === '9:16'
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-surface-border text-txt-secondary hover:border-accent/50 hover:bg-surface-secondary'
                  }`}
                >
                  Вертикальный 9:16
                </button>
              </div>
            </div>
          </div>
          {createError && <p className="text-red-500 text-xs mt-2">{createError}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm font-medium text-txt-secondary bg-surface-tertiary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={createLoading || !newName.trim()}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {createLoading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function formatProjectCount(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'проектов';
  if (lastDigit === 1) return 'проект';
  if (lastDigit >= 2 && lastDigit <= 4) return 'проекта';
  return 'проектов';
}
