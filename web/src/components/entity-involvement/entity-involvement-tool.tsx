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
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import {
  buildInvolvementTypesYaml,
  downloadInvolvementTypesYaml,
  downloadInvolvementTypesExcel,
  parseInvolvementTypesFile,
  type InvolvementTypeRecord,
} from "@/lib/export-import";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";

// ── Manage Involvement Types Dialog ──────────────────────────────────────────

function ManageInvolvementTypesDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: Id<"projects">;
}) {
  const types = useQuery(api.involvementTypes.list, { projectId });
  const createType = useMutation(api.involvementTypes.create);
  const removeType = useMutation(api.involvementTypes.remove);
  const bulkImport = useMutation(api.involvementTypes.bulkImport);

  const [newName, setNewName] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const typeList = types ?? [];

  async function handleAdd() {
    const name = newName.trim();
    if (!name || typeList.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    await createType({ projectId, name });
    setNewName("");
  }

  async function handlePasteAdd() {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setPasteMode(false); setPasteText(""); return; }
    const existing = new Set(typeList.map((t) => t.name.toLowerCase()));
    const newLines = lines.filter((l) => !existing.has(l.toLowerCase()));
    if (newLines.length) {
      await bulkImport({ projectId, rows: newLines.map((name) => ({ name })), mode: "append" });
    }
    setPasteText(""); setPasteMode(false);
    toast.success(`Added ${newLines.length} involvement type(s)`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Involvement Types</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ maxHeight: "460px" }}>
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Involvement Types ({typeList.length})
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
              <p className="text-xs text-slate-500">Paste one involvement type per line — duplicates are ignored.</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Borrower\nGuarantor\nCo-Borrower\nKey Principal"}
                rows={7}
                autoFocus
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] resize-none"
              />
              <Button size="sm" onClick={handlePasteAdd} className="w-full text-xs h-7">
                Add {pasteText.split("\n").filter((l) => {
                  const t = l.trim();
                  return t && !typeList.some((r) => r.name.toLowerCase() === t.toLowerCase());
                }).length} type(s)
              </Button>
            </div>
          ) : (
            <>
              <ul className="overflow-y-auto p-1.5 space-y-0.5" style={{ maxHeight: "320px" }}>
                {typeList.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-slate-400 italic">No involvement types yet.</li>
                )}
                {typeList.map((t) => (
                  <li key={t._id} className="flex items-center justify-between rounded px-2.5 py-1.5 text-sm hover:bg-slate-50 group">
                    <span>{t.name}</span>
                    <button
                      onClick={() => removeType({ id: t._id as Id<"involvementTypes"> })}
                      className="hidden group-hover:block text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-200 p-2 flex gap-1.5">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  placeholder="New involvement type…"
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

type PlaygroundEntry = { relationship: string; involvementType: string };

function EntityInvolvementPlayground({ typeNames, onOpenManage }: { typeNames: string[]; onOpenManage: () => void }) {
  const [relationship, setRelationship] = useState("");
  const [involvementType, setInvolvementType] = useState("");
  const [entries, setEntries] = useState<PlaygroundEntry[]>([]);

  function handleAdd() {
    const rel = relationship.trim();
    if (!rel || !involvementType) return;
    setEntries((prev) => [...prev, { relationship: rel, involvementType }]);
    setRelationship("");
    setInvolvementType("");
  }

  return (
    <div className="mt-8 max-w-3xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Click <button onClick={onOpenManage} className="text-[var(--color-blue)] hover:underline">Manage Involvement Types</button> to configure values.
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Add example entities to a loan to see how involvement types would appear in nCino. Each entry represents a relationship legally linked to the loan with a specific involvement type.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Input row */}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Relationship</label>
            <Input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="e.g. Jane Smith"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Involvement Type</label>
            <select
              value={involvementType}
              onChange={(e) => setInvolvementType(e.target.value)}
              className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
            >
              <option value="">Select type…</option>
              {typeNames.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="pb-0">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!relationship.trim() || !involvementType}
              className="h-8 text-xs"
            >
              + Add Entity to Loan
            </Button>
          </div>
        </div>

        {/* Results */}
        {entries.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-400 italic text-center">
            No entities added yet — fill in the form above and click Add Entity to Loan.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_1fr_auto] border-b border-slate-100 bg-slate-50 px-4 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Relationship</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Involvement Type</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100">
              {entries.map((e, i) => (
                <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-slate-50 group text-sm">
                  <span className="font-medium text-slate-800">{e.relationship}</span>
                  <span>
                    <span className="rounded-full bg-[var(--color-blue)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-blue)]">
                      {e.involvementType}
                    </span>
                  </span>
                  <button
                    onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}
                    className="hidden group-hover:block text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Tool ─────────────────────────────────────────────────────────────────

export function EntityInvolvementTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const types = useQuery(api.involvementTypes.list, { projectId });
  const bulkImport = useMutation(api.involvementTypes.bulkImport);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "entity-involvement");

  const [manageOpen, setManageOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const typeNames = useMemo(() => (types ?? []).map((t) => t.name), [types]);

  const asRecords = useCallback((): InvolvementTypeRecord[] =>
    (types ?? []).map((t) => ({ name: t.name })),
    [types]);

  const defaultMeta: YamlMeta = useMemo(() => ({
    storyId: "ENTITY-INV-001",
    title: `Entity Involvement Types — ${project?.name ?? ""}`,
    featureArea: "entity-involvement",
  }), [project?.name]);

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildInvolvementTypesYaml(asRecords(), meta),
    [types], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleImportConfirm(rows: InvolvementTypeRecord[], mode: ImportMode) {
    await bulkImport({ projectId, rows, mode });
    toast.success(`Imported ${rows.length} involvement type${rows.length !== 1 ? "s" : ""}`);
  }

  if (project === undefined || types === undefined) {
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
            Entity Involvement Type Builder — {project.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {types.length} involvement type{types.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManageOpen(true)} disabled={isLocked}>Manage Involvement Types</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>Import</Button>
          <Button variant="outline" onClick={() => downloadInvolvementTypesExcel(asRecords())}>Export Excel</Button>
          <Button variant="outline" onClick={() => setYamlOpen(true)}>Export YAML</Button>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-500 max-w-2xl">
        Involvement types define the legal role a relationship plays on a loan in nCino — for example, <span className="font-medium">Borrower</span>, <span className="font-medium">Guarantor</span>, or <span className="font-medium">Key Principal</span>.
      </p>

      {/* Types summary */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Configured Involvement Types — <button onClick={() => setManageOpen(true)} className="normal-case font-normal text-[var(--color-blue)] hover:underline">edit in Manage Involvement Types</button>
        </p>
        {types.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No involvement types configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <span key={t._id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Playground */}
      <EntityInvolvementPlayground typeNames={typeNames} onOpenManage={() => setManageOpen(true)} />

      <ManageInvolvementTypesDialog open={manageOpen} onOpenChange={setManageOpen} projectId={projectId} />

      <ImportDialog<InvolvementTypeRecord>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Involvement Types"
        acceptFileTypes=".yaml,.yml,.csv,.xls"
        parseFile={parseInvolvementTypesFile}
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
        onDownload={(meta) => downloadInvolvementTypesYaml(asRecords(), meta)}
      />
      </div>
    </div>
  );
}
