"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Doc } from "../../../convex/_generated/dataModel";
import { CARD_TYPE_STYLES } from "./card-styles";

type Card = Doc<"cards">;

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect?.(card)}
      className={`cursor-grab rounded-md px-3 py-2 text-xs shadow-sm active:cursor-grabbing ${
        CARD_TYPE_STYLES[card.type] ?? CARD_TYPE_STYLES.low
      }`}
    >
      <div className="font-semibold leading-snug">{card.name}</div>
      {card.sub ? (
        <div className="mt-0.5 text-[11px] opacity-80">{card.sub}</div>
      ) : null}
      <div className="mt-1.5 flex items-center justify-between">
        {card.type === "linked" ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-blue)]">
            Linked ↗
          </span>
        ) : (
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              card.status === "configured"
                ? "bg-emerald-500"
                : "bg-slate-400/60"
            }`}
            aria-label={card.status}
          />
        )}
      </div>
    </div>
  );
}
