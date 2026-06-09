"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { configuratorRoute } from "./configurator-registry";

const RELATIONSHIP_SUB_KINDS = ["relationships", "connections", "entity-involvement"] as const;

const KIND_ORDER: Record<string, number> = {
  stages: 0,
  "product-hierarchy": 1,
  relationships: 2,
  collateral: 3,
  checklist: 4,
  conditions: 5,
  "policy-exceptions": 6,
  fees: 7,
  covenants: 8,
  docman: 9,
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
  stages: "Stages and UI Builder",
  relationships: "Relationships Suite",
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
  relationships: "Configure relationship types, connection roles, and entity involvement types — three linked builders for how nCino models the people and entities connected to a deal.",
  stages: "Start here. Configure your loan lifecycle stages — each stage links directly to all other feature builders, making this the central hub for your entire nCino configuration. Configure the UI for additional Routes and Subroutes.",
};

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    // Closed padlock
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
    </svg>
  ) : (
    // Open padlock
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V5.5a2.5 2.5 0 015 0v.75a.75.75 0 001.5 0V5.5A4 4 0 0014.5 1z" clipRule="evenodd" />
    </svg>
  );
}

export function BuildersHub({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.heatmap.getForProject, { projectId });
  const project = useQuery(api.projects.get, { id: projectId });
  const lockedKinds = useQuery(api.builderLocks.listForProject, { projectId });
  const lock = useMutation(api.builderLocks.lock);
  const unlock = useMutation(api.builderLocks.unlock);
  const lockMany = useMutation(api.builderLocks.lockMany);
  const unlockMany = useMutation(api.builderLocks.unlockMany);

  if (data === undefined || project === undefined || lockedKinds === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (data === null || project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const lockedSet = new Set(lockedKinds);
  // "relationships" suite card is locked only when all 3 sub-builders are locked
  const relationshipsSuiteLocked = RELATIONSHIP_SUB_KINDS.every((k) => lockedSet.has(k));

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
    { kind: "relationships", route: `/projects/${projectId}/relationships` },
  ];
  for (const { kind, route } of PROJECT_LEVEL_BUILDERS) {
    if (!seen.has(kind)) seen.set(kind, { cardName: "", route });
  }

  const builders = [...seen.entries()].sort(
    ([a], [b]) => (KIND_ORDER[a] ?? 99) - (KIND_ORDER[b] ?? 99),
  );

  async function toggleLock(e: React.MouseEvent, kind: string) {
    e.preventDefault();
    e.stopPropagation();
    if (kind === "relationships") {
      if (relationshipsSuiteLocked) {
        await unlockMany({ projectId, kinds: [...RELATIONSHIP_SUB_KINDS] });
      } else {
        await lockMany({ projectId, kinds: [...RELATIONSHIP_SUB_KINDS] });
      }
    } else {
      if (lockedSet.has(kind)) {
        await unlock({ projectId, kind });
      } else {
        await lock({ projectId, kind });
      }
    }
  }

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
          {builders.map(([kind, { route }]) => {
            const isHero = kind === "stages";
            const isLocked = kind === "relationships" ? relationshipsSuiteLocked : lockedSet.has(kind);

            return (
              <div key={kind} className={`relative group/card flex flex-col${isHero ? " col-span-full" : ""}`}>
                <Link
                  href={route}
                  className={
                    isHero
                      ? "group flex flex-col gap-3 rounded-xl border-2 border-[var(--color-blue)] bg-[var(--color-blue)] p-6 shadow-md transition-shadow hover:shadow-lg flex-1"
                      : isLocked
                        ? "group flex flex-col gap-2 rounded-xl border border-slate-300 bg-slate-50 p-5 shadow-sm transition-shadow hover:shadow-md flex-1"
                        : "group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex-1"
                  }
                >
                  {isHero && (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                        Recommended starting point
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div className={`font-semibold ${isHero ? "text-xl text-white" : "text-base text-slate-900 group-hover:text-[var(--color-blue)]"}`}>
                      {KIND_LABEL[kind] ?? kind}
                    </div>
                    {/* Lock toggle + Agent icon stack */}
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <button
                        onClick={(e) => toggleLock(e, kind)}
                        title={isLocked ? "Unlock builder" : "Lock builder"}
                        className={`rounded p-1 transition-colors ${
                          isLocked
                            ? isHero
                              ? "text-amber-300 bg-white/20 hover:bg-white/30"
                              : "text-amber-500 bg-amber-50 hover:bg-amber-100"
                            : isHero
                              ? "text-white/50 hover:text-white hover:bg-white/20"
                              : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <LockIcon locked={isLocked} />
                      </button>
                      {isLocked && (
                        <button
                          onClick={(e) => e.preventDefault()}
                          title="Send to agent for configuration (coming soon)"
                          className={`flex flex-col items-center gap-0.5 rounded p-1 transition-colors ${
                            isHero
                              ? "text-violet-300 hover:bg-white/20"
                              : "text-violet-400 hover:bg-violet-50"
                          }`}
                        >
                          {/* Letter / envelope icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                            <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                          </svg>
                          <span className="text-[9px] font-semibold leading-none">Agent</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {isLocked && (
                    <span className={`self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isHero ? "bg-amber-400/20 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                      Locked
                    </span>
                  )}

                  <div className={`text-sm ${isHero ? "text-white/80" : "text-xs text-slate-500"}`}>
                    {KIND_DESCRIPTION[kind] ?? ""}
                  </div>

                  <div className={`mt-auto pt-1 text-sm font-medium ${isHero ? "text-white/90" : "text-xs text-[var(--color-blue)] opacity-0 group-hover:opacity-100"}`}>
                    {isLocked ? "View (read-only) →" : "Open builder →"}
                  </div>
                </Link>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
