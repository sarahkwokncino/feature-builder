"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Doc } from "../../../convex/_generated/dataModel";
import { HeatmapCard } from "./heatmap-card";
import { AddCardForm } from "./add-card-form";

type Subphase = Doc<"subphases"> & { cards: Doc<"cards">[] };

export function SubphaseColumn({
  subphase,
  onSelectCard,
}: {
  subphase: Subphase;
  onSelectCard: (card: Doc<"cards">) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: subphase._id,
    data: { subphaseId: subphase._id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[60px] flex-col gap-2 rounded-b-lg p-2 transition-colors border border-t-0 border-[var(--hm-line)] ${
        isOver
          ? "bg-[var(--hm-panel2)]"
          : "bg-[#0c1d30aa]"
      }`}
    >
      <SortableContext
        items={subphase.cards.map((c) => c._id)}
        strategy={verticalListSortingStrategy}
      >
        {subphase.cards.map((card) => (
          <HeatmapCard
            key={card._id}
            card={card}
            onSelect={onSelectCard}
          />
        ))}
      </SortableContext>
      <AddCardForm subphaseId={subphase._id} />
    </div>
  );
}
