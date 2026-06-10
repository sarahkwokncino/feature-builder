"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import {
  buildConnectionsYaml,
  downloadConnectionsYaml,
  downloadConnectionsExcel,
  parseConnectionsFile,
  type ConnectionRoleRecord,
} from "@/lib/export-import";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";

// ── Manage Roles Dialog ───────────────────────────────────────────────────────

function ManageRolesDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: Id<"projects">;
}) {
  const roles = useQuery(api.connections.list, { projectId });
  const createRole = useMutation(api.connections.create);
  const updateRole = useMutation(api.connections.update);
  const removeRole = useMutation(api.connections.remove);
  const bulkImport = useMutation(api.connections.bulkImport);

  const [newName, setNewName] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const roleList = roles ?? [];
  const roleNames = roleList.map((r) => r.name);

  async function handleAdd() {
    const name = newName.trim();
    if (!name || roleList.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    await createRole({ projectId, name });
    setNewName("");
  }

  async function handlePasteAdd() {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setPasteMode(false); setPasteText(""); return; }
    const existing = new Set(roleList.map((r) => r.name.toLowerCase()));
    const newLines = lines.filter((l) => !existing.has(l.toLowerCase()));
    if (newLines.length) {
      await bulkImport({
        projectId,
        rows: newLines.map((name) => ({ name })),
        mode: "append",
      });
    }
    setPasteText(""); setPasteMode(false);
    toast.success(`Added ${newLines.length} role(s)`);
  }

  async function handleToggleSelfReciprocating(id: Id<"connectionRoles">, current: boolean | undefined) {
    await updateRole({ id, selfReciprocating: !current || undefined, reciprocalRole: undefined });
  }

  async function handleSetReciprocalRole(id: Id<"connectionRoles">, value: string) {
    await updateRole({ id, reciprocalRole: value || undefined, selfReciprocating: undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Connection Roles</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ maxHeight: "560px" }}>
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Roles ({roleList.length})
            </p>
            <button
              onClick={() => { setPasteMode((v) => !v); setPasteText(""); }}
              className="text-[11px] text-[var(--color-blue)] hover:underline"
            >
              {pasteMode ? "Cancel paste" : "Paste list"}
            </button>
          </div>

          {pasteMode ? (
            <div className="p-3 space-y-2">
              <p className="text-xs text-slate-500">Paste one role name per line — duplicates are ignored.</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Director\nShareholder\nGuarantor\nBeneficial Owner"}
                rows={7}
                autoFocus
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] resize-none"
              />
              <Button size="sm" onClick={handlePasteAdd} className="w-full text-xs h-7">
                Add {pasteText.split("\n").filter((l) => {
                  const t = l.trim();
                  return t && !roleList.some((r) => r.name.toLowerCase() === t.toLowerCase());
                }).length} role(s)
              </Button>
            </div>
          ) : (
            <>
              {/* Column headers */}
              {roleList.length > 0 && (
                <div className="grid grid-cols-[1fr_110px_1fr_60px] gap-x-3 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Role Name</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-center">Self Reciprocating</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reciprocal Role</span>
                  <span />
                </div>
              )}

              <div className="overflow-y-auto" style={{ maxHeight: "380px" }}>
                {roleList.length === 0 && (
                  <p className="px-3 py-3 text-xs text-slate-400 italic">No roles yet.</p>
                )}
                {roleList.map((r) => (
                  <div key={r._id} className="grid grid-cols-[1fr_110px_1fr_60px] gap-x-3 items-center border-b border-slate-100 last:border-0 px-3 py-1.5 hover:bg-slate-50 group">
                    <span className="text-sm text-slate-800 truncate">{r.name}</span>

                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={!!r.selfReciprocating}
                        disabled={!!r.reciprocalRole}
                        onChange={() => handleToggleSelfReciprocating(r._id as Id<"connectionRoles">, r.selfReciprocating)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>

                    <select
                      value={r.reciprocalRole ?? ""}
                      disabled={!!r.selfReciprocating}
                      onChange={(e) => handleSetReciprocalRole(r._id as Id<"connectionRoles">, e.target.value)}
                      className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:opacity-30 disabled:bg-slate-50 disabled:cursor-not-allowed"
                    >
                      <option value="">—</option>
                      {roleNames.filter((n) => n !== r.name).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => removeRole({ id: r._id as Id<"connectionRoles"> })}
                      className="hidden group-hover:block text-xs text-red-500 hover:text-red-700 justify-self-end"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 p-2 flex gap-1.5">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  placeholder="New role name…"
                  className="text-xs h-7"
                />
                <Button size="sm" onClick={handleAdd} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview Playground ────────────────────────────────────────────────────────

type RoleMeta = {
  name: string;
  selfReciprocating?: boolean;
  reciprocalRole?: string;
};

// All connections visible from a given relationship's perspective
type RelView = {
  subject: string;
  connections: { role: string; counterparty: string }[];
};

function ConnectionPlayground({ roles }: { roles: RoleMeta[] }) {
  const roleNames = roles.map((r) => r.name);
  const roleMap = useMemo(() => {
    const m = new Map<string, RoleMeta>();
    for (const r of roles) m.set(r.name, r);
    return m;
  }, [roles]);

  const [fromRel, setFromRel] = useState("");
  const [toRel, setToRel] = useState("");
  const [role, setRole] = useState("");
  // null = no result yet; otherwise the two relationship views
  const [views, setViews] = useState<[RelView, RelView] | null>(null);
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  function handleAdd() {
    const f = fromRel.trim();
    const t = toRel.trim();
    if (!f || !t || !role) return;

    const meta = roleMap.get(role);

    // Build what each side sees
    const fromView: RelView = { subject: f, connections: [{ role, counterparty: t }] };
    const toView: RelView = { subject: t, connections: [] };

    if (meta?.selfReciprocating) {
      toView.connections.push({ role, counterparty: f });
    } else if (meta?.reciprocalRole) {
      toView.connections.push({ role: meta.reciprocalRole, counterparty: f });
    }

    setViews([fromView, toView]);
    setActiveTab(0);
    setFromRel(""); setToRel(""); setRole("");
  }

  return (
    <div className="mt-8 max-w-3xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Enter two relationship names and pick a role, then toggle between each relationship to see the connections as they would appear on each record in nCino.
      </p>

      {/* Input form */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden mb-5">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto] gap-3 items-end px-4 py-3 bg-slate-50">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">From Relationship</label>
            <Input
              value={fromRel}
              onChange={(e) => setFromRel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="e.g. Jane Smith"
              className="h-8 text-sm"
            />
          </div>
          <div className="pb-1 text-slate-400 text-sm font-medium">→</div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
            >
              <option value="">Select role…</option>
              {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="pb-1 text-slate-400 text-sm font-medium">→</div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">To Relationship</label>
            <Input
              value={toRel}
              onChange={(e) => setToRel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="e.g. Acme Ltd"
              className="h-8 text-sm"
            />
          </div>
          <div className="pb-1">
            <Button size="sm" onClick={handleAdd} disabled={!fromRel.trim() || !toRel.trim() || !role} className="h-8 text-xs">
              Render
            </Button>
          </div>
        </div>
      </div>

      {/* Per-relationship view */}
      {views === null ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-400 italic text-center">
          Fill in the form above and click Render to see how each relationship record would look.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Tab toggle */}
          <div className="flex border-b border-slate-200">
            {views.map((v, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx as 0 | 1)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === idx
                    ? "bg-white text-slate-900 border-b-2 border-[var(--color-blue)] -mb-px"
                    : "bg-slate-50 text-slate-500 hover:text-slate-700"
                }`}
              >
                {v.subject}
              </button>
            ))}
          </div>

          {/* Active relationship's connections */}
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Connections on <span className="text-slate-700">{views[activeTab].subject}</span>
            </p>
            {views[activeTab].connections.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                No connection roles on this relationship — no reciprocal role is configured for this direction.
              </p>
            ) : (
              <ul className="space-y-2">
                {views[activeTab].connections.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-slate-800">{views[activeTab].subject}</span>
                    <span className="text-slate-400">→</span>
                    <span className="rounded-full bg-[var(--color-blue)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-blue)]">
                      {c.role}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-slate-800">{c.counterparty}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Tool ─────────────────────────────────────────────────────────────────

export function ConnectionsTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const roles = useQuery(api.connections.list, { projectId });
  const bulkImport = useMutation(api.connections.bulkImport);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "connections");

  const [manageOpen, setManageOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const asRecords = useCallback((): ConnectionRoleRecord[] =>
    (roles ?? []).map((r) => ({
      name: r.name,
      description: r.description,
      selfReciprocating: r.selfReciprocating,
      reciprocalRole: r.reciprocalRole,
    })),
    [roles]);

  const defaultMeta: YamlMeta = useMemo(() => ({
    storyId: "CONN-CONFIG-001",
    title: `Connection Roles — ${project?.name ?? ""}`,
    featureArea: "connections",
  }), [project?.name]);

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildConnectionsYaml(asRecords(), meta),
    [roles], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleImportConfirm(rows: ConnectionRoleRecord[], mode: ImportMode) {
    await bulkImport({ projectId, rows, mode });
    toast.success(`Imported ${rows.length} connection role${rows.length !== 1 ? "s" : ""}`);
  }

  if (project === undefined || roles === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  return (
    <div className="pb-6">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Connections Builder — {project.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {roles.length} connection role{roles.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManageOpen(true)} disabled={isLocked}>Manage Roles</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>Import</Button>
          <ExportButton
            onExcelClick={() => downloadConnectionsExcel(asRecords())}
            onYamlClick={() => setYamlOpen(true)}
          />
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-500 max-w-2xl">
        Connection roles define how one relationship record can be linked to another in nCino — for example, an <span className="font-medium">Individual</span> connected to a <span className="font-medium">Business</span> as a <span className="font-medium">Director</span> or <span className="font-medium">Shareholder</span>.
      </p>

      {/* Roles summary */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Configured Roles — <button onClick={() => setManageOpen(true)} className="normal-case font-normal text-[var(--color-blue)] hover:underline">edit in Manage Roles</button>
        </p>
        {roles.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No roles configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span key={r._id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                {r.name}
                {r.selfReciprocating && <span className="ml-1 text-violet-500">↺</span>}
                {r.reciprocalRole && <span className="ml-1 text-sky-500">↔</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Playground */}
      <ConnectionPlayground roles={roles.map((r) => ({ name: r.name, selfReciprocating: r.selfReciprocating, reciprocalRole: r.reciprocalRole }))} />

      <ManageRolesDialog open={manageOpen} onOpenChange={setManageOpen} projectId={projectId} />

      <ImportDialog<ConnectionRoleRecord>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Connection Roles"
        acceptFileTypes=".yaml,.yml,.csv,.xls"
        parseFile={parseConnectionsFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0 text-sm">
            <span className="font-medium">{r.name}</span>
          </div>
        )}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadConnectionsYaml(asRecords(), meta)}
      />
      </div>
    </div>
  );
}
