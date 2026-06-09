"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Topbar } from "@/components/topbar";

const SUB_BUILDERS = [
  {
    kind: "relationships",
    href: (projectId: string) => `/projects/${projectId}/relationships/relationship-types`,
    title: "Relationship Type Builder",
    description:
      "Configure the types of relationships that can exist between parties — e.g. Guarantor, Director, Beneficial Owner. Each type gets its own field layout and section configuration.",
    tag: "LLC_BI__Relationship__c · LLC_BI__Type__c",
  },
  {
    kind: "connections",
    href: (projectId: string) => `/projects/${projectId}/relationships/connections`,
    title: "Connections Builder",
    description:
      "Define the roles that connect a contact or account to a loan or relationship record — e.g. Primary Contact, Key Stakeholder. Controls which connection roles appear in nCino.",
    tag: "LLC_BI__Connection_Role__c",
  },
  {
    kind: "entity-involvement",
    href: (projectId: string) => `/projects/${projectId}/relationships/entity-involvement`,
    title: "Entity Involvement Type Builder",
    description:
      "Configure entity involvement types that describe how a legal entity participates in a deal — e.g. Borrower, Co-Borrower, Guarantor Entity. Used on the borrowing structure.",
    tag: "LLC_BI__Legal_Entities__c · LLC_BI__Borrower_Type__c",
  },
];

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V5.5a2.5 2.5 0 015 0v.75a.75.75 0 001.5 0V5.5A4 4 0 0014.5 1z" clipRule="evenodd" />
    </svg>
  );
}

export default function RelationshipsSuitePage() {
  const params = useParams();
  const projectId = params.projectId as Id<"projects">;

  const lockedKinds = useQuery(api.builderLocks.listForProject, { projectId });
  const lock = useMutation(api.builderLocks.lock);
  const unlock = useMutation(api.builderLocks.unlock);

  const lockedSet = new Set(lockedKinds ?? []);

  async function toggleLock(e: React.MouseEvent, kind: string) {
    e.preventDefault();
    e.stopPropagation();
    if (lockedSet.has(kind)) {
      await unlock({ projectId, kind });
    } else {
      await lock({ projectId, kind });
    }
  }

  return (
    <>
      <Topbar
        title="Relationships Suite"
        back={{ href: `/projects/${projectId}`, label: "Heatmap" }}
        back2={{ href: `/projects/${projectId}/builders`, label: "Feature Builders" }}
      />
      <main className="flex-1 overflow-auto bg-slate-100">
        <div className="p-8 max-w-4xl">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900">Relationships Suite</h2>
            <p className="mt-2 text-sm text-slate-500 max-w-2xl">
              Three related builders that together configure how nCino models the people and entities connected to a deal — their types, their roles, and how they&apos;re involved in the borrowing structure.
            </p>
          </div>

          <div className="space-y-4">
            {SUB_BUILDERS.map((b) => {
              const isLocked = lockedSet.has(b.kind);
              return (
                <div key={b.kind} className="flex flex-col gap-2">
                  <Link
                    href={b.href(projectId as string)}
                    className={`group flex flex-col gap-2 rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md ${
                      isLocked ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`font-semibold text-base ${isLocked ? "text-slate-600" : "text-slate-900 group-hover:text-[var(--color-blue)]"}`}>
                          {b.title}
                        </div>
                        {isLocked && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Locked
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                          {b.tag}
                        </span>
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={(e) => toggleLock(e, b.kind)}
                            title={isLocked ? "Unlock builder" : "Lock builder"}
                            className={`rounded p-1 transition-colors ${
                              isLocked
                                ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                                : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            <LockIcon locked={isLocked} />
                          </button>
                          {isLocked && (
                            <button
                              onClick={(e) => e.stopPropagation()}
                              title="Send to agent for configuration (coming soon)"
                              className="flex flex-col items-center gap-0.5 rounded p-1 text-violet-400 transition-colors hover:bg-violet-50"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                              </svg>
                              <span className="text-[9px] font-semibold leading-none">Agent</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500">{b.description}</p>
                    <div className={`mt-1 text-xs font-medium ${isLocked ? "text-slate-400" : "text-[var(--color-blue)] opacity-0 group-hover:opacity-100"}`}>
                      {isLocked ? "View (read-only) →" : "Open builder →"}
                    </div>
                  </Link>

                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
