import type { DragItem, DragItemType } from '@/lib/types';

/** Convert a typed ID to a prefixed DnD string ID */
export function toDndId(type: DragItemType, id: number): string {
  return `${type}-${id}`;
}

/** Parse a prefixed DnD string ID back to type + numeric ID */
export function parseDndId(dndId: string | number): DragItem | null {
  const str = String(dndId);
  const dashIndex = str.indexOf('-');
  if (dashIndex === -1) return null;
  const type = str.slice(0, dashIndex) as DragItemType;
  if (type !== 'element' && type !== 'group') return null;
  const id = Number(str.slice(dashIndex + 1));
  if (Number.isNaN(id)) return null;
  return { type, id };
}
