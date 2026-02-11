'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Box } from '@/lib/api';
import DropdownMenu from './ui/DropdownMenu';
import ConfirmDialog from './ui/ConfirmDialog';
import Modal from './ui/Modal';
import { useProjectsStore } from '@/lib/store/projects';

interface BoxCardProps {
  box: Box;
  index: number;
  aspectClass?: string;
}

const STATUS_CONFIG = {
  DRAFT: { label: 'Черновик', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  REVIEW: { label: 'На проверке', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Утверждён', color: 'bg-green-100 text-green-700' },
} as const;

export default function BoxCard({ box, index, aspectClass = 'aspect-video' }: BoxCardProps) {
  const { updateBox, deleteBox } = useProjectsStore();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: box.id });

  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [newName, setNewName] = useState(box.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isHovering, setIsHovering] = useState(false);

  const hasHeadliner = !!box.headliner_url;
  const isVideo = box.headliner_type === 'VIDEO';
  const mediaFitClass = aspectClass === 'aspect-vertical' ? 'object-contain' : 'object-cover';

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      await updateBox(box.id, { name: newName.trim() });
      toast.success('Сцена переименована');
      setShowRename(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при переименовании';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: Box['status']) => {
    setLoading(true);
    try {
      await updateBox(box.id, { status: newStatus });
      toast.success('Статус сцены изменён');
      setShowStatus(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при изменении статуса';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteBox(box.id);
      toast.success('Сцена удалена');
      setShowDelete(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка при удалении';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
    if (isVideo && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

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
        setNewName(box.name);
        setError('');
        setShowRename(true);
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

  const handleCardClick = () => {
    router.push(`/projects/${box.project}/boxes/${box.id}`);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="group cursor-pointer rounded-xl bg-white border border-surface-border hover:border-accent/30 hover:shadow-md transition-all duration-200 overflow-hidden animate-fade-in-up"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
      >
        {/* Thumbnail / Headliner */}
        <div className={`relative ${aspectClass} bg-surface-tertiary overflow-hidden`}>
          {hasHeadliner ? (
            <>
              {isVideo ? (
                <>
                  <Image
                    src={box.headliner_thumbnail_url || box.headliner_url}
                    alt={box.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className={`${mediaFitClass} transition-opacity duration-300 ${isHovering ? 'opacity-0' : 'opacity-100'}`}
                  />
                  <video
                    ref={videoRef}
                    src={box.headliner_url}
                    muted
                    loop
                    playsInline
                    className={`absolute inset-0 w-full h-full ${mediaFitClass} transition-opacity duration-300 ${isHovering ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-xs text-white flex items-center gap-1 z-10">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Видео
                  </div>
                </>
              ) : (
                <Image
                  src={box.headliner_thumbnail_url || box.headliner_url}
                  alt={box.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className={`${mediaFitClass} ${aspectClass === 'aspect-vertical' ? '' : 'group-hover:scale-105'} transition-transform duration-500`}
                />
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <div className="w-10 h-10 rounded-lg bg-surface-hover/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-txt-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <span className="text-[10px] text-txt-muted/40 font-medium">Нет обложки</span>
            </div>
          )}

          {/* Order badge */}
          <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white z-10">
            {index + 1}
          </div>

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-11 bg-black/50 backdrop-blur-sm w-7 h-7 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-white">
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
          </div>

          {/* Dropdown menu */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <DropdownMenu items={menuItems} />
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-txt-primary truncate group-hover:text-accent transition-colors flex-1">
              {box.name}
            </h3>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${STATUS_CONFIG[box.status].color}`}>
              {STATUS_CONFIG[box.status].label}
            </span>
          </div>
          <p className="text-xs text-txt-muted">
            {box.assets_count} {formatElementCount(box.assets_count)}
          </p>
        </div>
      </div>

      {/* Rename Modal */}
      <Modal isOpen={showRename} onClose={() => setShowRename(false)} title="Переименовать сцену">
        <form onSubmit={(e) => { e.preventDefault(); handleRename(); }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-secondary border border-surface-border rounded-lg text-txt-primary text-sm placeholder-txt-muted focus:border-accent focus:outline-none transition-colors"
            placeholder="Название сцены"
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
              disabled={loading || box.status === status}
              className={`w-full px-4 py-3 text-left rounded-lg border transition-all ${
                box.status === status
                  ? 'border-accent bg-accent/5 cursor-default'
                  : 'border-surface-border hover:border-accent/50 hover:bg-surface-secondary'
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-txt-primary">{STATUS_CONFIG[status].label}</span>
                {box.status === status && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Удалить сцену?"
        message={`Сцена «${box.name}» и все её элементы будут удалены безвозвратно.`}
        confirmText="Удалить"
        danger
        loading={loading}
      />
    </>
  );
}

function formatElementCount(count: number): string {
  if (count === 0) return 'элементов';
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'элементов';
  if (lastDigit === 1) return 'элемент';
  if (lastDigit >= 2 && lastDigit <= 4) return 'элемента';
  return 'элементов';
}
