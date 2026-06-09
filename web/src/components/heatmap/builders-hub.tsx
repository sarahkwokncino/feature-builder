"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { configuratorRoute } from "./configurator-registry";

const KIND_ORDER: Record<string, number> = {
  stages: 0,
  "product-hierarchy": 1,
  checklist: 2,
  conditions: 3,
  "policy-exceptions": 4,
  fees: 5,
  covenants: 6,
  docman: 7,
  collateral: 8,
};

const KIND_LABEL: Record<string, string> = {
  checklist: "Smart Checklist Builder",
  conditions: "Conditions Builder",
  "policy-exceptions": "Policy Exceptions Builder",
  fees: "Fees Builder",
  covenants: "Covenant Type Builder",
  "product-hierarchy": "Product Hierarchy Builder",
  docman: "Document Manager Builder",
  collateral: "Collateral Management Builder",
  stages: "Stages Builder",
};

const KIND_DESCRIPTION: Record<string, string> = {
  checklist: "Configure smart checklist requirements for loan and relationship levels.",
  conditions: "Configure loan conditions precedent and subsequent.",
  "policy-exceptions": "Configure policy exception types, severities, and mitigation reasons.",
  fees: "Configure fee types, amounts, and application rules.",
  covenants: "Configure covenant types, categories, and frequency templates.",
  "product-hierarchy": "Configure product lines, types, and products.",
  docman: "Configure document manager placeholders and conditional groups.",
  collateral: "Configure collateral types and management settings.",
  stages: "Start here. Configure your loan lifecycle stages — each stage links directly to all other feature builders, making this the central hub for your entire nCino configuration.",
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

  // Project-level builders always shown regardless of heatmap cards
  const PROJECT_LEVEL_BUILDERS: { kind: string; route: string }[] = [
    { kind: "product-hierarchy", route: `/projects/${projectId}/product-hierarchy` },
    { kind: "collateral", route: `/projects/${projectId}/collateral` },
    { kind: "conditions", route: `/projects/${projectId}/conditions` },
    { kind: "policy-exceptions", route: `/projects/${projectId}/policy-exceptions` },
    { kind: "fees", route: `/projects/${projectId}/fees` },
    { kind: "stages", route: `/projects/${projectId}/stages` },
  ];
  for (const { kind, route } of PROJECT_LEVEL_BUILDERS) {
    if (!seen.has(kind)) seen.set(kind, { cardName: "", route });
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
          {builders.map(([kind, { cardName, route }]) => {
            const isHero = kind === "stages";
            return (
              <Link
                key={kind}
                href={route}
                className={
                  isHero
                    ? "group col-span-full flex flex-col gap-3 rounded-xl border-2 border-[var(--color-blue)] bg-[var(--color-blue)] p-6 shadow-md transition-shadow hover:shadow-lg"
                    : "group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                }
              >
                {isHero && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                      Recommended starting point
                    </span>
                  </div>
                )}
                <div className={`font-semibold ${isHero ? "text-xl text-white" : "text-base text-slate-900 group-hover:text-[var(--color-blue)]"}`}>
                  {KIND_LABEL[kind] ?? kind}
                </div>
                <div className={`text-sm ${isHero ? "text-white/80" : "text-xs text-slate-500"}`}>
                  {KIND_DESCRIPTION[kind] ?? ""}
                </div>
                <div className={`mt-auto pt-1 text-sm font-medium ${isHero ? "text-white/90" : "text-xs text-[var(--color-blue)] opacity-0 group-hover:opacity-100"}`}>
                  Open builder →
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
