"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaygroundState } from "@/components/stages/playground-state-context";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import { ExportButton } from "@/components/ui/export-button";
import {
  buildPolicyExceptionsYaml,
  downloadPolicyExceptionsYaml,
  downloadPolicyExceptionsExcel,
  parsePolicyExceptionsFile,
  type PolicyExceptionRecord,
} from "@/lib/export-import";
import { POLICY_EXCEPTION_TYPES } from "@/lib/picklist-defaults";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  HelpDialog,
  HelpSection,
  HelpTip,
  HelpTable,
  HelpScreenshot,
} from "@/components/ui/help-dialog";

const ALL_SEVERITIES = ["Minor", "Major", "Critical"] as const;

export function PolicyExceptionsTool({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const project = useQuery(api.projects.get, { id: projectId });
  const records = useQuery(api.policyExceptions.listForProject, { projectId });
  const create = useMutation(api.policyExceptions.create);
  const remove = useMutation(api.policyExceptions.remove);
  const bulkImport = useMutation(api.policyExceptions.bulkImport);
  const setPicklistValues = useMutation(api.picklists.setValues);
  const storedPicklists = useQuery(api.picklists.listForScope, { scope: "policy-exceptions" });

  const [selectedId, setSelectedId] = useState<Id<"policyExceptions"> | null>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "append">("append");
  const [importPreview, setImportPreview] = useState<PolicyExceptionRecord[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const { isLocked, toggleLock } = useBuilderLock(projectId, "policy-exceptions");
  const [newTypeName, setNewTypeName] = useState("");

  // Use stored types as authoritative once saved; fall back to defaults only if nothing saved yet
  const allTypes = useMemo(() => {
    const stored = storedPicklists?.find((p) => p.key === "types")?.values;
    return stored ?? POLICY_EXCEPTION_TYPES;
  }, [storedPicklists]);

  async function handleAddType() {
    const name = newTypeName.trim();
    if (!name) return;
    if (allTypes.includes(name)) {
      toast.error(`Type "${name}" already exists.`);
      return;
    }
    await setPicklistValues({ scope: "policy-exceptions", key: "types", values: [...allTypes, name] });
    setNewTypeName("");
    toast.success(`Type "${name}" added`);
  }

  async function handleRemoveType(type: string) {
    await setPicklistValues({ scope: "policy-exceptions", key: "types", values: allTypes.filter((t) => t !== type) });
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportError(null);
    setImportPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parsePolicyExceptionsFile(text, file.name);
      if (typeof result === "string") {
        setImportError(result);
      } else {
        setImportPreview(result);
      }
    };
    reader.readAsText(file);
  }

  async function handleImportConfirm() {
    if (!importPreview) return;
    const newTypes = [...new Set(importPreview.map((r) => r.type.trim()).filter(Boolean))].filter(
      (t) => !allTypes.includes(t),
    );
    if (newTypes.length) {
      await setPicklistValues({
        scope: "policy-exceptions",
        key: "types",
        values: [...allTypes, ...newTypes],
      });
    }
    await bulkImport({ projectId, mode: importMode, records: importPreview });
    setImportOpen(false);
    setImportPreview(null);
    setImportError(null);
    setImportFileName("");
    toast.success(`Imported ${importPreview.length} exception${importPreview.length !== 1 ? "s" : ""}`);
  }

  // Keep selectedId pointing at a valid record
  useEffect(() => {
    if (!records) return;
    if (!selectedId && records.length > 0) {
      setSelectedId(records[0]._id);
    }
    if (selectedId && !records.find((r) => r._id === selectedId)) {
      setSelectedId(records[0]?._id ?? null);
    }
  }, [records, selectedId]);

  // Group records by type, sort groups alphabetically, sort within group by order
  const groups = useMemo(() => {
    if (!records) return [];
    const map = new Map<string, Doc<"policyExceptions">[]>();
    for (const r of records) {
      if (!map.has(r.type)) map.set(r.type, []);
      map.get(r.type)!.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, items]) => ({ type, items }));
  }, [records]);

  const exportRows = useMemo<PolicyExceptionRecord[]>(
    () =>
      (records ?? []).map((r) => ({
        type: r.type,
        name: r.name,
        severities: r.severities,
        mitigationReasons: r.mitigationReasons,
      })),
    [records],
  );

  const defaultMeta: YamlMeta = useMemo(
    () => ({
      storyId: "PE-CONFIG-001",
      title: `Policy Exceptions — ${project?.name ?? ""}`,
      featureArea: "policy-exceptions",
    }),
    [project?.name],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildPolicyExceptionsYaml(exportRows, meta),
    [exportRows],
  );

  if (project === undefined || records === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  async function handleAdd() {
    const id = await create({ projectId, type: "Other", name: "Untitled exception" });
    setSelectedId(id);
    toast.success("Exception added");
  }

  async function handleDelete(id: Id<"policyExceptions">) {
    if (!confirm("Delete this exception?")) return;
    await remove({ id });
    toast.success("Exception deleted");
  }

  const selected = records.find((r) => r._id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Policy Exceptions Builder — {project.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManageTypesOpen(true)} disabled={isLocked}>
            Manage types
          </Button>
          <Button
            variant="outline"
            disabled={isLocked}
            onClick={() => { setImportPreview(null); setImportError(null); setImportFileName(""); setImportOpen(true); }}
          >
            Import
          </Button>
          <ExportButton
            disabled={records.length === 0}
            onExcelClick={() => downloadPolicyExceptionsExcel(exportRows)}
            onYamlClick={() => setYamlOpen(true)}
          />
          <Button variant="outline" onClick={() => setHelpOpen(true)}>? Help</Button>
          <Button
            onClick={handleAdd}
            disabled={isLocked}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            + Add Exception
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_1fr]">
        {/* Left: grouped list */}
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {records.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No exceptions yet. Click &ldquo;+ Add Exception&rdquo; to start.
            </div>
          ) : (
            <div>
              {groups.map(({ type, items }) => (
                <div key={type}>
                  {/* Group header */}
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {type}
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {items.length}
                    </span>
                  </div>
                  {/* Exceptions in group */}
                  <ul className="divide-y divide-slate-100">
                    {items.map((exc) => (
                      <li
                        key={exc._id}
                        className={`flex items-start gap-2 px-3 py-2 hover:bg-slate-50 ${
                          exc._id === selectedId ? "bg-[var(--color-blue)]/10" : ""
                        }`}
                      >
                        <button
                          onClick={() => setSelectedId(exc._id)}
                          className="flex-1 text-left text-sm"
                        >
                          <div
                            className={
                              exc.name.trim()
                                ? "font-medium text-slate-900"
                                : "italic text-slate-400"
                            }
                          >
                            {exc.name.trim() || "Untitled exception"}
                          </div>
                          {exc.severities.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {exc.severities.map((s) => (
                                <span
                                  key={s}
                                  className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                        {!isLocked && (
                          <button
                            onClick={() => handleDelete(exc._id)}
                            className="rounded px-1 text-xs text-red-500 hover:bg-red-50"
                            aria-label="Delete"
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail form */}
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <ExceptionDetail key={selected._id} record={selected} allRecords={records} allTypes={allTypes} isLocked={isLocked} />
          ) : (
            <div className="text-sm text-slate-500">
              Add an exception to get started.
            </div>
          )}
        </div>
      </div>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Policy Exceptions</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Accepts Excel (.xls), YAML (.yaml/.yml), or CSV (.csv) files exported from this builder.
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">File</label>
              <input
                type="file"
                accept=".xls,.xlsx,.yaml,.yml,.csv"
                onChange={handleImportFileChange}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1 file:text-xs hover:file:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Import mode</label>
              <div className="flex gap-4">
                {(["append", "replace"] as const).map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="pe-import-mode"
                      value={m}
                      checked={importMode === m}
                      onChange={() => setImportMode(m)}
                      className="h-4 w-4 border-slate-300"
                    />
                    <span className="capitalize">{m}</span>
                    <span className="text-xs text-slate-400">
                      {m === "append" ? "(keep existing)" : "(delete existing first)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {importError && (
              <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{importError}</p>
            )}

            {importPreview && (
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-700">
                  Preview — {importPreview.length} exception{importPreview.length !== 1 ? "s" : ""} from &ldquo;{importFileName}&rdquo;
                </p>
                <ul className="max-h-48 overflow-y-auto space-y-1">
                  {importPreview.map((r, i) => (
                    <li key={i} className="text-xs text-slate-700">
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-1 text-slate-400">({r.type})</span>
                      {r.severities.length > 0 && (
                        <span className="ml-1 text-slate-400">· {r.severities.join(", ")}</span>
                      )}
                      {r.mitigationReasons.length > 0 && (
                        <span className="ml-1 text-slate-400">· {r.mitigationReasons.length} reason{r.mitigationReasons.length !== 1 ? "s" : ""}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              disabled={!importPreview || !!importError}
              onClick={handleImportConfirm}
              className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
            >
              Import {importPreview ? `(${importPreview.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Types dialog */}
      <Dialog open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Types</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">Add or remove policy exception types. Types in use by existing exceptions cannot be removed.</p>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {allTypes.map((t) => {
              const inUse = (records ?? []).some((r) => r.type === t);
              return (
                <li key={t} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-slate-800">{t}</span>
                  {!inUse && (
                    <button
                      onClick={() => handleRemoveType(t)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                  {inUse && <span className="text-xs text-slate-400 italic">in use</span>}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Input
              placeholder="New type name…"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddType(); }}
              className="flex-1"
            />
            <Button onClick={handleAddType} disabled={!newTypeName.trim()}>Add</Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManageTypesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadPolicyExceptionsYaml(exportRows, meta)}
      />

      <PolicyExceptionsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </div>
  );
}

function PolicyExceptionsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <HelpDialog open={open} onOpenChange={onOpenChange} title="Policy Exceptions Builder — Help">
      <HelpSection title="What are Policy Exceptions?">
        <p>Policy Exceptions record instances where a loan departs from the institution&apos;s lending policy, requiring formal acknowledgement and mitigating factors. They are tracked per loan with severities and an approval workflow, and the loan-level summary shows counts by severity (Minor, Major, Critical).</p>
      </HelpSection>

      <HelpScreenshot src="/help-policy-exceptions.png" alt="Policy Exceptions on a loan" caption="Policy Exceptions panel on a loan record in nCino" />

      <HelpSection title="Key concepts">
        <HelpTable rows={[
          ["Exception Type", "The area or policy being breached (configurable — these are your named exception categories)."],
          ["Exception Name", "The specific exception within a type. Each Type has its own list of named exceptions."],
          ["Severity", "Minor, Major, or Critical — fixed system values. Drives the summary counters and colour-coding on the loan."],
          ["Mitigation Reasons", "The valid reasons that can be offered to justify the exception. Configurable per exception name."],
          ["Comment Required", "Whether the approver must provide a free-text comment when selecting a given mitigation reason."],
        ]} />
      </HelpSection>

      <HelpSection title="How to use this builder">
        <p><strong>Manage Exception Types</strong> — opens the type/name editor where you define Exception Types and the named exceptions within each type. Use the left panel to add/remove Types; select a Type to manage its Exceptions and their severities and mitigation reasons on the right.</p>
        <p><strong>Import</strong> — import a previously exported policy exception configuration (YAML or XLS).</p>
        <p><strong>Export</strong> — downloads all exception types, names, severities, and mitigation reasons as Excel or YAML.</p>
        <p><strong>+ Add Exception</strong> — adds a new exception record using the Types you have configured. Fill in the detail panel on the right.</p>
      </HelpSection>

      <HelpSection title="Preview Playground">
        <p>The preview section simulates the Policy Exceptions panel on a loan record to show how approvers will see and interact with exceptions. It is a <strong>sandbox only</strong> — not saved or exported.</p>
      </HelpSection>

      <HelpTip>In nCino, configure policy exceptions under <strong>nCino Admin &gt; Policy Exception Types</strong>. Severity values (Minor/Major/Critical) are fixed system values and cannot be changed.</HelpTip>
    </HelpDialog>
  );
}

// ─── Preview Playground ───────────────────────────────────────────────────────

type PreviewException = {
  id: string;
  type: string;
  name: string;
  severities: string[];
  mitigationReasons: { reason: string; commentRequired: boolean }[];
  // runtime state
  selectedSeverity: string;
  selectedReasons: string[];
  comment: string;
};

const SEVERITY_COLOURS: Record<string, string> = {
  Minor:    "bg-yellow-100 text-yellow-700",
  Major:    "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
};

export function PolicyExceptionsPreviewPlayground({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const records = useQuery(api.policyExceptions.listForProject, { projectId });
  const storedPicklists = useQuery(api.picklists.listForScope, { scope: "policy-exceptions" });

  const allTypes = useMemo(() => {
    const stored = storedPicklists?.find((p) => p.key === "types")?.values;
    return stored ?? POLICY_EXCEPTION_TYPES;
  }, [storedPicklists]);

  const allExceptions = useMemo(
    () => (records ?? []).map((r) => ({
      id: r._id,
      type: r.type,
      name: r.name,
      severities: r.severities,
      mitigationReasons: r.mitigationReasons,
    })),
    [records],
  );

  const { addedExceptions: added, setAddedExceptions: setAdded } = usePlaygroundState();
  const [dialogOpen, setDialogOpen] = useState(false);

  // dialog state
  const [dialogType, setDialogType] = useState("");
  const [dialogName, setDialogName] = useState("");
  const [dialogSeverity, setDialogSeverity] = useState("");

  const filteredByType = useMemo(
    () => dialogType ? allExceptions.filter((e) => e.type === dialogType) : [],
    [allExceptions, dialogType],
  );

  const selectedConfig = useMemo(
    () => allExceptions.find((e) => e.id === dialogName) ?? null,
    [allExceptions, dialogName],
  );

  function openDialog() {
    setDialogType("");
    setDialogName("");
    setDialogSeverity("");
    setDialogOpen(true);
  }

  function handleAdd() {
    if (!selectedConfig || !dialogSeverity) return;
    const alreadyAdded = added.find((a) => a.id === selectedConfig.id);
    if (alreadyAdded) return;
    setAdded((prev) => [
      ...prev,
      {
        ...selectedConfig,
        selectedSeverity: dialogSeverity,
        selectedReasons: [],
        comment: "",
      },
    ]);
    setDialogOpen(false);
  }

  function handleRemove(id: string) {
    setAdded((prev) => prev.filter((e) => e.id !== id));
  }

  function setReason(id: string, slot: 0 | 1 | 2, value: string) {
    setAdded((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const next = [e.selectedReasons[0] ?? "", e.selectedReasons[1] ?? "", e.selectedReasons[2] ?? ""] as [string, string, string];
        next[slot] = value;
        return { ...e, selectedReasons: next.filter((r, i) => i === slot || r !== value) };
      }),
    );
  }

  function setComment(id: string, value: string) {
    setAdded((prev) =>
      prev.map((e) => (e.id === id ? { ...e, comment: value } : e)),
    );
  }

  const canAdd = !!selectedConfig && !!dialogSeverity;

  return (
    <div className="max-w-4xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Reflects your <span className="font-medium">Policy Exceptions Builder</span> config.
        </span>
        <Button onClick={openDialog} className="ml-auto bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]">
          + Add an Exception
        </Button>
      </div>

      {/* Added exceptions list */}
      {added.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 italic shadow-sm">
          No exceptions added yet — click <strong>+ Add an Exception</strong> to select from your library.
        </div>
      ) : (
        <div className="space-y-3">
          {added.map((exc) => {
            const needsComment = exc.selectedReasons.some((r) => {
              if (!r) return false;
              return exc.mitigationReasons.find((m) => m.reason === r)?.commentRequired ?? false;
            });
            return (
              <div key={exc.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{exc.name}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{exc.type}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOURS[exc.selectedSeverity] ?? "bg-slate-100 text-slate-600"}`}>
                        {exc.selectedSeverity}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(exc.id)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>

                {exc.mitigationReasons.length > 0 && (
                  <div className="mt-3">
                    <div className="grid grid-cols-3 gap-3">
                      {([0, 1, 2] as const).map((slot) => {
                        const otherSlots = ([0, 1, 2] as const).filter((s) => s !== slot);
                        const usedByOthers = otherSlots.map((s) => exc.selectedReasons[s] ?? "").filter(Boolean);
                        return (
                          <div key={slot}>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Mitigation Reason {slot + 1}
                            </label>
                            <select
                              value={exc.selectedReasons[slot] ?? ""}
                              onChange={(e) => setReason(exc.id, slot, e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-[var(--color-blue)] focus:outline-none"
                            >
                              <option value="">— None —</option>
                              {exc.mitigationReasons.map((mr) => (
                                <option
                                  key={mr.reason}
                                  value={mr.reason}
                                  disabled={usedByOthers.includes(mr.reason)}
                                >
                                  {mr.reason}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {needsComment && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Comments <span className="text-red-500">*</span>
                      <span className="ml-1 font-normal text-slate-400">(required for selected reason)</span>
                    </label>
                    <textarea
                      value={exc.comment}
                      onChange={(e) => setComment(exc.id, e.target.value)}
                      placeholder="Write a comment…"
                      rows={3}
                      className={`w-full rounded-md border px-3 py-2 text-sm text-slate-700 focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] ${
                        !exc.comment.trim() ? "border-red-400" : "border-slate-300"
                      }`}
                    />
                    {!exc.comment.trim() && (
                      <p className="mt-0.5 text-xs text-red-500">Comment is required.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Exception dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an Exception</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Policy Area <span className="text-red-500">*</span>
              </label>
              <select
                value={dialogType}
                onChange={(e) => { setDialogType(e.target.value); setDialogName(""); setDialogSeverity(""); }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none"
              >
                <option value="">— Select type —</option>
                {allTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Policy Exception Name <span className="text-red-500">*</span>
              </label>
              <select
                value={dialogName}
                onChange={(e) => { setDialogName(e.target.value); setDialogSeverity(""); }}
                disabled={!dialogType}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">— Select exception —</option>
                {filteredByType.map((e) => (
                  <option key={e.id} value={e.id} disabled={!!added.find((a) => a.id === e.id)}>
                    {e.name}{added.find((a) => a.id === e.id) ? " (already added)" : ""}
                  </option>
                ))}
              </select>
              {dialogType && filteredByType.length === 0 && (
                <p className="mt-1 text-xs text-slate-400 italic">No exceptions configured for this type.</p>
              )}
            </div>

            {/* Severity */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Severity <span className="text-red-500">*</span>
              </label>
              {selectedConfig && selectedConfig.severities.length > 0 ? (
                <div className="flex gap-3">
                  {selectedConfig.severities.map((s) => (
                    <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="dialog-severity"
                        value={s}
                        checked={dialogSeverity === s}
                        onChange={() => setDialogSeverity(s)}
                        className="h-4 w-4 border-slate-300 text-[var(--color-blue)]"
                      />
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOURS[s] ?? "bg-slate-100 text-slate-600"}`}>
                        {s}
                      </span>
                    </label>
                  ))}
                </div>
              ) : selectedConfig ? (
                <p className="text-xs text-slate-400 italic">No severities configured for this exception.</p>
              ) : (
                <p className="text-xs text-slate-400 italic">Select a name first.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!canAdd}
              onClick={handleAdd}
              className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Detail form ──────────────────────────────────────────────────────────────

function ExceptionDetail({
  record,
  allRecords,
  allTypes,
  isLocked,
}: {
  record: Doc<"policyExceptions">;
  allRecords: Doc<"policyExceptions">[];
  allTypes: string[];
  isLocked: boolean;
}) {
  const update = useMutation(api.policyExceptions.update);

  const [type, setType] = useState(record.type);
  const [name, setName] = useState(record.name);
  const [severities, setSeverities] = useState<string[]>(record.severities);
  const [mitigationReasons, setMitigationReasons] = useState(
    record.mitigationReasons.length > 0
      ? record.mitigationReasons
      : [] as { reason: string; commentRequired: boolean }[],
  );

  async function persist(overrides?: {
    type?: string;
    name?: string;
    severities?: string[];
    mitigationReasons?: { reason: string; commentRequired: boolean }[];
  }) {
    const resolvedName = (overrides?.name ?? name).trim();
    if (!resolvedName) {
      toast.error("Name is required.");
      return;
    }
    const resolvedType = overrides?.type ?? type;
    const duplicate = allRecords.find(
      (r) =>
        r._id !== record._id &&
        r.name.trim().toLowerCase() === resolvedName.toLowerCase() &&
        r.type === resolvedType,
    );
    if (duplicate) {
      toast.error(`An exception named "${resolvedName}" already exists under type "${resolvedType}".`);
      return;
    }
    await update({
      id: record._id,
      type: resolvedType,
      name: resolvedName,
      severities: overrides?.severities ?? severities,
      mitigationReasons: overrides?.mitigationReasons ?? mitigationReasons,
    });
    toast.success("Saved");
  }

  function handleTypeChange(value: string) {
    setType(value);
    persist({ type: value });
  }

  function handleSeverityToggle(severity: string) {
    const next = severities.includes(severity)
      ? severities.filter((s) => s !== severity)
      : [...severities, severity];
    setSeverities(next);
    persist({ severities: next });
  }

  function handleAddMitigation() {
    const next = [...mitigationReasons, { reason: "", commentRequired: false }];
    setMitigationReasons(next);
  }

  function handleMitigationChange(
    index: number,
    field: "reason" | "commentRequired",
    value: string | boolean,
  ) {
    const next = mitigationReasons.map((mr, i) =>
      i === index ? { ...mr, [field]: value } : mr,
    );
    setMitigationReasons(next);
    if (field === "commentRequired") {
      persist({ mitigationReasons: next });
    }
  }

  function handleMitigationBlur(index: number) {
    // Remove trailing empty reasons before persisting
    const trimmed = mitigationReasons.map((mr) => ({
      ...mr,
      reason: mr.reason.trim(),
    }));
    setMitigationReasons(trimmed);
    persist({ mitigationReasons: trimmed });
  }

  function handleRemoveMitigation(index: number) {
    const next = mitigationReasons.filter((_, i) => i !== index);
    setMitigationReasons(next);
    persist({ mitigationReasons: next });
  }

  return (
    <div className="space-y-5">
      {/* Type */}
      <div>
        <Label htmlFor="pe-type">Type</Label>
        <div className="mt-1 flex flex-col gap-2">
          <select
            id="pe-type"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={isLocked}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {allTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="pe-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="pe-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => persist()}
          disabled={isLocked}
          className={!name.trim() ? "border-red-400 focus:border-red-400" : ""}
        />
        {!name.trim() && (
          <p className="mt-1 text-xs text-red-500">Name is required.</p>
        )}
      </div>

      {/* Severities */}
      <div>
        <Label>Severities</Label>
        <div className="mt-2 flex gap-4">
          {ALL_SEVERITIES.map((sev) => (
            <label key={sev} className={`flex items-center gap-2 text-sm ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={severities.includes(sev)}
                onChange={() => handleSeverityToggle(sev)}
                disabled={isLocked}
                className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed"
              />
              {sev}
            </label>
          ))}
        </div>
      </div>

      {/* Mitigation Reasons */}
      <div>
        <Label>Mitigation Reasons</Label>
        <div className="mt-2 space-y-2">
          {mitigationReasons.length === 0 && (
            <p className="text-xs text-slate-400">No mitigation reasons added yet.</p>
          )}
          {mitigationReasons.map((mr, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Reason…"
                value={mr.reason}
                onChange={(e) => handleMitigationChange(i, "reason", e.target.value)}
                onBlur={() => handleMitigationBlur(i)}
                disabled={isLocked}
                className="flex-1"
              />
              <label className={`flex shrink-0 items-center gap-1.5 text-xs text-slate-600 ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={mr.commentRequired}
                  onChange={(e) =>
                    handleMitigationChange(i, "commentRequired", e.target.checked)
                  }
                  disabled={isLocked}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--color-blue)] disabled:cursor-not-allowed"
                />
                Comment required?
              </label>
              {!isLocked && (
                <button
                  onClick={() => handleRemoveMitigation(i)}
                  className="rounded px-1 text-sm text-red-500 hover:bg-red-50"
                  aria-label="Remove mitigation reason"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {!isLocked && (
          <button
            onClick={handleAddMitigation}
            className="mt-2 text-xs font-medium text-[var(--color-blue)] hover:underline"
          >
            + Add mitigation reason
          </button>
        )}
      </div>

      {/* Save */}
      {!isLocked && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={() => persist()}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
