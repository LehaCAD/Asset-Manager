'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { type Project } from '@/lib/api';
import DropdownMenu from './ui/DropdownMenu';
import ConfirmDialog from './ui/ConfirmDialog';
import Modal from './ui/Modal';
import { useProjectsStore } from '@/lib/store/projects';

interface ProjectCardProps {
  project: Project;
}

const STATUS_CONFIG = {
  ACTIVE: { label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  PAUSED: { label: 'На паузе', color: 'bg-yellow-100 text-yellow-700' },
  COMPLETED: { label: 'Завершён', color: 'bg-green-100 text-green-700' },
} as const;

export default function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const { updateProject, deleteProject } = useProjectsStore();
  
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showAspect, setShowAspect] = useState(false);
  const [newName, setNewName] = useState(project.name);
  const [newAspectRatio, setNewAspectRatio] = useState<'16:9' | '9:16'>(project.aspect_ratio);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRename = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      await updateProject(project.id, { name: newName.trim() });
      toast.success('Проект переименован');
      setShowRename(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при переименовании';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: Project['status']) => {
    setLoading(true);
    try {
      await updateProject(project.id, { status: newStatus });
      toast.success('Статус проекта изменён');
      setShowStatus(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при изменении статуса';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAspectChange = async () => {
    if (newAspectRatio === project.aspect_ratio) {
      setShowAspect(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await updateProject(project.id, { aspect_ratio: newAspectRatio });
      toast.success('Формат кадров изменён');
      setShowAspect(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при изменении формата';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteProject(project.id);
      toast.success('Проект удалён');
      setShowDelete(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при удалении';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = new Date(project.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const menuItems = [
    {
      label: 'Изменить статус',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      onClick: () => setShowStatus(true),
    },
    {
      label: 'Переименовать',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      ),
      onClick: () => {
        setNewName(project.name);
        setError('');
        setShowRename(true);
      },
    },
    {
      label: 'Изменить формат',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      onClick: () => {
        setNewAspectRatio(project.aspect_ratio);
        setError('');
        setShowAspect(true);
      },
    },
    {
      label: 'Удалить',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      ),
      onClick: () => setShowDelete(true),
      danger: true,
    },
  ];

  return (
    <>
      <div
        className="group relative cursor-pointer rounded-xl bg-white border border-surface-border hover:border-accent/30 hover:shadow-md transition-all duration-200 animate-fade-in-up"
      >
        {/* Dropdown menu - positioned at card level, OUTSIDE overflow-hidden areas */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
          <DropdownMenu items={menuItems} />
        </div>

        <div onClick={() => router.push(`/projects/${project.id}`)}>
          {/* Thumbnail area */}
          <div className="relative aspect-video bg-surface-tertiary flex items-center justify-center overflow-hidden rounded-t-xl">
            {/* Placeholder gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-surface-tertiary to-purple-100" />
            <div className="relative z-10 flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-txt-muted/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-xs text-txt-muted/60 font-medium">
                {project.boxes_count} {formatSceneCount(project.boxes_count)}
              </span>
            </div>
          </div>

          {/* Info area */}
          <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-txt-primary truncate group-hover:text-accent transition-colors flex-1">
              {project.name}
            </h3>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600">
              {project.aspect_ratio}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${STATUS_CONFIG[project.status].color}`}>
              {STATUS_CONFIG[project.status].label}
            </span>
          </div>
          <p className="text-xs text-txt-muted mb-2">
            {formattedDate}
          </p>
          
          {/* Progress bar */}
          {project.boxes_count > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-txt-muted">
                <span>Прогресс</span>
                <span className="font-medium">
                  {project.boxes_approved_count}/{project.boxes_count} утверждено
                </span>
              </div>
              <div className="w-full bg-surface-tertiary rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${project.boxes_count > 0 ? (project.boxes_approved_count / project.boxes_count) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Rename Modal */}
      <Modal isOpen={showRename} onClose={() => setShowRename(false)} title="Переименовать проект">
        <form onSubmit={(e) => { e.preventDefault(); handleRename(); }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
            placeholder="Название проекта"
            autoFocus
          />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowRename(false)}
              className="px-4 py-2 text-sm font-medium text-txt-secondary bg-surface-tertiary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !newName.trim()}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Status change modal */}
      <Modal isOpen={showStatus} onClose={() => setShowStatus(false)} title="Изменить статус">
        <div className="space-y-2">
          {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={loading || project.status === status}
              className={`w-full px-4 py-3 text-left rounded-lg border transition-all ${
                project.status === status
                  ? 'border-accent bg-accent/5 cursor-default'
                  : 'border-surface-border hover:border-accent/50 hover:bg-surface-secondary'
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-txt-primary">{STATUS_CONFIG[status].label}</span>
                {project.status === status && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Aspect ratio modal */}
      <Modal isOpen={showAspect} onClose={() => setShowAspect(false)} title="Изменить формат кадров">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewAspectRatio('16:9')}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                newAspectRatio === '16:9'
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-surface-border text-txt-secondary hover:border-accent/50 hover:bg-surface-secondary'
              }`}
            >
              Горизонтальный 16:9
            </button>
            <button
              type="button"
              onClick={() => setNewAspectRatio('9:16')}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                newAspectRatio === '9:16'
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-surface-border text-txt-secondary hover:border-accent/50 hover:bg-surface-secondary'
              }`}
            >
              Вертикальный 9:16
            </button>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAspect(false)}
              className="px-4 py-2 text-sm font-medium text-txt-secondary bg-surface-tertiary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleAspectChange}
              disabled={loading || newAspectRatio === project.aspect_ratio}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Удалить проект?"
        message={`Проект «${project.name}» и все его сцены будут удалены безвозвратно. Это действие нельзя отменить.`}
        confirmText="Удалить"
        danger
        loading={loading}
      />
    </>
  );
}

function formatSceneCount(count: number): string {
  if (count === 0) return 'сцен';
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'сцен';
  if (lastDigit === 1) return 'сцена';
  if (lastDigit >= 2 && lastDigit <= 4) return 'сцены';
  return 'сцен';
}
