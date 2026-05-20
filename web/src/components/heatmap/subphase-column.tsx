"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
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
  const renameSubphase = useMutation(api.heatmap.renameSubphase);
  const deleteSubphase = useMutation(api.heatmap.deleteSubphase);

  const { setNodeRef, isOver } = useDroppable({
    id: subphase._id,
    data: { subphaseId: subphase._id },
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subphase.name);

  async function commitRename() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== subphase.name) {
      await renameSubphase({ id: subphase._id, name: trimmed });
    } else {
      setName(subphase.name);
    }
    setEditing(false);
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${subphase.name}" and all ${subphase.cards.length} card(s)?`,
      )
    )
      return;
    await deleteSubphase({ id: subphase._id });
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-32 flex-col gap-2 rounded-md p-2 transition-colors ${
        isOver
          ? "bg-[var(--color-blue)]/30"
          : "bg-[var(--color-navy-light)]/60"
      }`}
    >
      <div className="group/sub flex items-center justify-between gap-1 px-1 pb-1">
        {editing ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(subphase.name);
                setEditing(false);
              }
            }}
            className="h-6 text-xs"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-xs font-semibold uppercase tracking-wide text-white/80 hover:text-white"
          >
            {subphase.name}
          </button>
        )}
        <button
          onClick={handleDelete}
          aria-label={`Delete ${subphase.name}`}
          className="rounded px-1 text-xs text-white/40 opacity-0 hover:bg-white/10 hover:text-white group-hover/sub:opacity-100"
        >
          ×
        </button>
      </div>
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
