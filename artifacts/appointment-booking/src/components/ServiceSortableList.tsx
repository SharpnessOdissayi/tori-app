import { useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, GripVertical } from "lucide-react";

type ServiceLike = {
  id: number;
  name: string;
  price: number;
  durationMinutes: number;
  bufferMinutes: number;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder?: number;
  color?: string | null;
};

export function ServiceSortableList({
  services,
  emptyFallback,
  onEdit,
  onDelete,
  onReorder,
}: {
  services: any[];
  emptyFallback?: ReactNode;
  onEdit: (s: any) => void;
  onDelete: (s: any) => void;
  // Called with the NEW ordered list after a drop. Parent persists
  // the sortOrder values and invalidates caches.
  onReorder: (newList: any[]) => Promise<void> | void;
}) {
  const ordered = useMemo(() => {
    return (services ?? []).slice().sort((a: ServiceLike, b: ServiceLike) => {
      const aO = (a as any).sortOrder ?? 0;
      const bO = (b as any).sortOrder ?? 0;
      return aO - bO || a.id - b.id;
    });
  }, [services]);

  // Optimistic local copy — we reorder it during drag for instant
  // visual feedback, then call onReorder on drop.
  const [localOrder, setLocalOrder] = useState<any[] | null>(null);
  const displayed = localOrder ?? ordered;

  const [dragId, setDragId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  // Pointer-event drag handles BOTH touch and mouse. HTML5 DnD API
  // doesn't fire on most mobile browsers, so we roll our own.
  const pointerState = useRef<{ active: boolean }>({ active: false });

  const startDrag = (e: React.PointerEvent, id: number) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointerState.current.active = true;
    setDragId(id);
    setHoverId(id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerState.current.active || dragId == null) return;
    // Find which card the pointer is currently over by walking up
    // from the elementFromPoint until we hit a data-service-id node.
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const cardEl = el?.closest<HTMLElement>("[data-service-id]");
    const overId = cardEl ? Number(cardEl.dataset.serviceId) : null;
    if (!overId || overId === hoverId) return;
    setHoverId(overId);
    // Reorder the local list live so the cards slide as the user drags.
    setLocalOrder(prev => {
      const base = prev ?? ordered;
      const from = base.findIndex(s => s.id === dragId);
      const to = base.findIndex(s => s.id === overId);
      if (from < 0 || to < 0 || from === to) return base;
      const next = base.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const endDrag = async () => {
    pointerState.current.active = false;
    const finalList = localOrder;
    setDragId(null);
    setHoverId(null);
    setLocalOrder(null);
    if (finalList) {
      await onReorder(finalList);
    }
  };

  return (
    <div
      dir="rtl"
      // Explicit rtl so service #1 renders in the right-hand column
      // (grid flow follows writing direction).
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {displayed.map((s: any) => {
        const isDragging = dragId === s.id;
        return (
          <div
            key={s.id}
            data-service-id={s.id}
            className={`border rounded-xl overflow-hidden transition-all select-none ${
              !s.isActive ? "opacity-50 bg-muted/20" : "bg-card"
            } ${isDragging ? "opacity-60 scale-[1.02] ring-2 ring-primary shadow-xl" : "hover:border-primary/40"}`}
            style={{ touchAction: "none" }}
          >
            {s.imageUrl && (
              <div className="h-32 overflow-hidden">
                <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" draggable={false} />
              </div>
            )}
            <div className="p-4 flex justify-between items-center gap-2">
              {/* Drag handle — the grip icon. PointerDown here starts
                  the drag; clicking elsewhere on the card (edit, delete)
                  doesn't trigger it. */}
              <button
                type="button"
                onPointerDown={e => startDrag(e, s.id)}
                className="p-1.5 rounded-lg cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0"
                aria-label="גרור להזזה"
                title="גרור כדי להזיז"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-2 flex-wrap">
                  {s.color && (
                    <span className="inline-block w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ background: s.color }} aria-label="צבע שירות" />
                  )}
                  {s.name}
                  {!s.isActive && <Badge variant="secondary" className="text-xs">לא פעיל</Badge>}
                </div>
                <div className="text-sm text-muted-foreground mt-1" dir="rtl">
                  <bdi>₪{(s.price / 100).toFixed(0)}</bdi>{" • "}<bdi>{s.durationMinutes} דק׳</bdi>
                  {s.bufferMinutes > 0 && <span className="mr-2"> • מאגר: {s.bufferMinutes} דקות</span>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(s)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/8 hover:bg-primary/15 text-primary border border-primary/15 transition-all"
                >
                  <Edit className="w-3 h-3" /> ערוך
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all"
                >
                  <Trash2 className="w-3 h-3" /> מחק
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {emptyFallback}
    </div>
  );
}
