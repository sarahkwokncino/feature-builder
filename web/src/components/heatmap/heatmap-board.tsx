"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { HeatmapCard } from "./heatmap-card";
import { SubphaseColumn } from "./subphase-column";
import { PhaseBanner } from "./phase-banner";
import { AddPhaseForm } from "./add-phase-form";
import { CardDetailsDialog } from "./card-details-dialog";
import { configuratorRoute } from "./configurator-registry";

type Card = Doc<"cards">;
type SubphaseWithCards = Doc<"subphases"> & { cards: Card[] };
type PhaseWithSubphases = Doc<"phases"> & { subphases: SubphaseWithCards[] };

export function HeatmapBoard({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.heatmap.getForProject, { projectId });
  const project = useQuery(api.projects.get, { id: projectId });
  const moveCard = useMutation(api.heatmap.moveCard);
  const router = useRouter();

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [detailsCard, setDetailsCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (data === undefined || project === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading heatmap…</div>;
  }
  if (data === null || project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const phases = data.phases as PhaseWithSubphases[];
  const heatmapId = data.heatmap._id;

  // cardId -> location
  const cardLocations = new Map<
    Id<"cards">,
    { subphaseId: Id<"subphases">; index: number; card: Card }
  >();
  for (const phase of phases) {
    for (const sub of phase.subphases) {
      sub.cards.forEach((card, index) => {
        cardLocations.set(card._id, { subphaseId: sub._id, index, card });
      });
    }
  }
  const subphaseLookup = new Map<Id<"subphases">, SubphaseWithCards>();
  for (const phase of phases) {
    for (const sub of phase.subphases) subphaseLookup.set(sub._id, sub);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as Id<"cards">;
    const loc = cardLocations.get(id);
    if (loc) setActiveCard(loc.card);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as Id<"cards">;
    const fromLoc = cardLocations.get(cardId);
    if (!fromLoc) return;

    const overId = over.id;
    const overSubphase = subphaseLookup.get(overId as Id<"subphases">);

    let targetSubphaseId: Id<"subphases">;
    let targetIndex: number;

    if (overSubphase) {
      targetSubphaseId = overSubphase._id;
      targetIndex = overSubphase.cards.length;
    } else {
      const overLoc = cardLocations.get(overId as Id<"cards">);
      if (!overLoc) return;
      targetSubphaseId = overLoc.subphaseId;
      targetIndex = overLoc.index;
    }

    if (
      fromLoc.subphaseId === targetSubphaseId &&
      fromLoc.index === targetIndex
    ) {
      return;
    }

    moveCard({ cardId, targetSubphaseId, targetIndex });
  }

  function handleSelectCard(card: Card) {
    const route = configuratorRoute(card, projectId);
    if (route) {
      router.push(route);
      return;
    }
    setDetailsCard(card);
  }

  // Each phase column is sized by its subphase count; one extra column for
  // the trailing "+ Add phase" affordance.
  const gridTemplate =
    phases
      .map((p) => `${Math.max(1, p.subphases.length)}fr`)
      .join(" ") + " 1fr";

  return (
    <div className="p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {project.name}
          </h2>
          {project.customer ? (
            <p className="text-xs text-slate-500">
              {project.customer}
              {project.region ? ` · ${project.region}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveCard(null)}
      >
        {/* Phase banners */}
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {phases.map((phase) => (
            <PhaseBanner key={phase._id} phase={phase} />
          ))}
          <AddPhaseForm heatmapId={heatmapId} />
        </div>

        {/* Subphase columns */}
        <div
          className="mt-1 grid gap-2"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {phases.map((phase) => (
            <div
              key={phase._id}
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.max(
                  1,
                  phase.subphases.length,
                )}, minmax(0, 1fr))`,
              }}
            >
              {phase.subphases.length === 0 ? (
                <div className="rounded-md bg-[var(--color-navy-light)]/30 p-2 text-center text-[11px] text-white/50">
                  Click + on the phase header to add a subphase.
                </div>
              ) : (
                phase.subphases.map((sub) => (
                  <SubphaseColumn
                    key={sub._id}
                    subphase={sub}
                    onSelectCard={handleSelectCard}
                  />
                ))
              )}
            </div>
          ))}
          <div /> {/* spacer to align with the trailing AddPhaseForm column */}
        </div>

        <DragOverlay>
          {activeCard ? <HeatmapCard card={activeCard} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      <CardDetailsDialog
        card={detailsCard}
        open={!!detailsCard}
        onOpenChange={(o) => !o && setDetailsCard(null)}
      />
    </div>
  );
}
