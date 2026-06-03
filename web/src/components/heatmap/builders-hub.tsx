"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { configuratorRoute } from "./configurator-registry";

const KIND_ORDER: Record<string, number> = {
  "product-hierarchy": 0,
  checklist: 1,
  covenants: 2,
  docman: 3,
};

const KIND_LABEL: Record<string, string> = {
  checklist: "Smart Checklist Builder",
  covenants: "Covenant Type Builder",
  "product-hierarchy": "Product Hierarchy Builder",
  docman: "Document Manager Builder",
};

const KIND_DESCRIPTION: Record<string, string> = {
  checklist: "Configure smart checklist requirements for loan and relationship levels.",
  covenants: "Configure covenant types, categories, and frequency templates.",
  "product-hierarchy": "Configure product lines, types, and products.",
  docman: "Configure document manager placeholders and conditional groups.",
};

export function BuildersHub({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.heatmap.getForProject, { projectId });
  const project = useQuery(api.projects.get, { id: projectId });

  if (data === undefined || project === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (data === null || project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  // Collect one entry per configuratorKind — use the first card found for each kind
  const seen = new Map<string, { cardName: string; route: string }>();
  for (const phase of data.phases as { subphases: { cards: { _id: Id<"cards">; name: string; configuratorKind?: string }[] }[] }[]) {
    for (const sub of phase.subphases) {
      for (const card of sub.cards) {
        if (!card.configuratorKind || seen.has(card.configuratorKind)) continue;
        const route = configuratorRoute(card as Parameters<typeof configuratorRoute>[0], projectId);
        if (route) seen.set(card.configuratorKind, { cardName: card.name, route });
      }
    }
  }

  const builders = [...seen.entries()].sort(
    ([a], [b]) => (KIND_ORDER[a] ?? 99) - (KIND_ORDER[b] ?? 99),
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Feature Builders</h2>
        <p className="mt-1 text-sm text-slate-500">{project.name}</p>
      </div>

      {builders.length === 0 ? (
        <p className="text-sm text-slate-500">
          No builder cards found in this project's heatmap.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builders.map(([kind, { cardName, route }]) => (
            <Link
              key={kind}
              href={route}
              className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="text-base font-semibold text-slate-900 group-hover:text-[var(--color-blue)]">
                {KIND_LABEL[kind] ?? kind}
              </div>
              <div className="text-xs text-slate-500">
                {KIND_DESCRIPTION[kind] ?? ""}
              </div>
              <div className="mt-auto pt-2 text-xs font-medium text-[var(--color-blue)] opacity-0 group-hover:opacity-100">
                Open builder →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
