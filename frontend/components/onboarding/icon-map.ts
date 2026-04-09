import type { LucideIcon } from 'lucide-react';
import {
  FolderOpen, LayoutGrid, WandSparkles, Maximize, Download,
  Upload, RefreshCw, Share2, CircleDot, Trophy,
} from 'lucide-react';

const ONBOARDING_ICONS: Record<string, LucideIcon> = {
  'folder-open': FolderOpen,
  'layout-grid': LayoutGrid,
  'wand-sparkles': WandSparkles,
  'maximize': Maximize,
  'download': Download,
  'upload': Upload,
  'refresh-cw': RefreshCw,
  'share-2': Share2,
  'trophy': Trophy,
};

export function getOnboardingIcon(name: string): LucideIcon {
  return ONBOARDING_ICONS[name] ?? CircleDot;
}
