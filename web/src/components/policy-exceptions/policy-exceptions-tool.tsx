"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import {
  buildPolicyExceptionsYaml,
  downloadPolicyExceptionsYaml,
  downloadPolicyExceptionsExcel,
  type PolicyExceptionRecord,
} from "@/lib/export-import";
import { POLICY_EXCEPTION_TYPES } from "@/lib/picklist-defaults";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
  const setPicklistValues = useMutation(api.picklists.setValues);
  const storedPicklists = useQuery(api.picklists.listForScope, { scope: "policy-exceptions" });

  const [selectedId, setSelectedId] = useState<Id<"policyExceptions"> | null>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
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
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Policy Exceptions Builder — {project.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManageTypesOpen(true)}>
            Manage types
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadPolicyExceptionsExcel(exportRows)}
            disabled={records.length === 0}
          >
            Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => setYamlOpen(true)}
            disabled={records.length === 0}
          >
            Export YAML
          </Button>
          <Button
            onClick={handleAdd}
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
                        <button
                          onClick={() => handleDelete(exc._id)}
                          className="rounded px-1 text-xs text-red-500 hover:bg-red-50"
                          aria-label="Delete"
                        >
                          ×
                        </button>
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
            <ExceptionDetail key={selected._id} record={selected} allRecords={records} allTypes={allTypes} />
          ) : (
            <div className="text-sm text-slate-500">
              Add an exception to get started.
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}

// ─── Detail form ──────────────────────────────────────────────────────────────

function ExceptionDetail({
  record,
  allRecords,
  allTypes,
}: {
  record: Doc<"policyExceptions">;
  allRecords: Doc<"policyExceptions">[];
  allTypes: string[];
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
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
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
            <label key={sev} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={severities.includes(sev)}
                onChange={() => handleSeverityToggle(sev)}
                className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)]"
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
                className="flex-1"
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={mr.commentRequired}
                  onChange={(e) =>
                    handleMitigationChange(i, "commentRequired", e.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--color-blue)]"
                />
                Comment required?
              </label>
              <button
                onClick={() => handleRemoveMitigation(i)}
                className="rounded px-1 text-sm text-red-500 hover:bg-red-50"
                aria-label="Remove mitigation reason"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={handleAddMitigation}
          className="mt-2 text-xs font-medium text-[var(--color-blue)] hover:underline"
        >
          + Add mitigation reason
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={() => persist()}
          className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
