"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Doc } from "../../../convex/_generated/dataModel";

type Card = Doc<"cards">;

const STATUS_BORDER: Record<string, string> = {
  configured:    "border-l-[var(--hm-ev)]",
  "in-progress": "border-l-[var(--hm-potential)]",
  gap:           "border-l-[var(--hm-confirmed)]",
};

export function HeatmapCard({
  card,
  isDragging,
  onSelect,
}: {
  card: Card;
  isDragging?: boolean;
  onSelect?: (card: Card) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = useSortable({ id: card._id, data: { card } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: sortableDragging ? 0.4 : isDragging ? 0.9 : 1,
  };

  const borderCls = STATUS_BORDER[card.status ?? ""] ?? "border-l-[var(--hm-none)]";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect?.(card)}
      className={`relative cursor-grab rounded-md border border-[var(--hm-line)] border-l-4 ${borderCls} bg-[var(--hm-panel)] px-2.5 py-2 text-xs shadow-sm transition-transform active:cursor-grabbing hover:-translate-y-px hover:bg-[var(--hm-panel2)]`}
    >
      <div className="text-[10px] text-[var(--hm-muted)]">{card.featureId ? `#${card.featureId}` : ""}</div>
      <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-[var(--hm-ink)]">{card.name}</div>
      {card.sub ? (
        <div className="mt-0.5 text-[11px] italic text-[var(--hm-muted)]">{card.sub}</div>
      ) : null}
    </div>
  );
}
