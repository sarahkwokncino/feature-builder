"use client";

import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PicklistEditor } from "@/components/covenants/picklist-editor";
import {
  CHECKLIST_PICKLISTS,
  CHECKLIST_PICKLIST_LABELS,
} from "@/lib/picklist-defaults";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import {
  buildChecklistYaml,
  downloadChecklistYaml,
  downloadChecklistExcel,
  parseChecklistYaml,
  parseChecklistCsvExcel,
  type ChecklistRecord,
  type ChecklistLevel,
} from "@/lib/export-import";
import { toast } from "sonner";

const CHECKLIST_LEVELS: ChecklistLevel[] = ["Loan", "Relationship"];

export function ChecklistTool({
  projectId,
  cardId,
}: {
  projectId: Id<"projects">;
  cardId?: Id<"cards">;
}) {
  const project = useQuery(api.projects.get, { id: projectId });
  const records = useQuery(
    api.checklist.listForCard,
    cardId ? { cardId } : "skip",
  );
  const create = useMutation(api.checklist.create);
  const update = useMutation(api.checklist.update);
  const remove = useMutation(api.checklist.remove);
  const bulkImport = useMutation(api.checklist.bulkImport);

  const [activeLevel, setActiveLevel] = useState<ChecklistLevel>("Loan");
  const [selectedId, setSelectedId] = useState<Id<"checklistReqs"> | null>(null);
  const [picklistOpen, setPicklistOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "checklist");

  const stored = useQuery(api.picklists.listForScope, { scope: "checklist" });
  const picklistMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of Object.keys(CHECKLIST_PICKLISTS)) {
      m.set(k, CHECKLIST_PICKLISTS[k]);
    }
    if (stored) for (const p of stored) m.set(p.key, p.values);
    return m;
  }, [stored]);

  const visibleRecords = useMemo(
    () => (records ?? []).filter((r) => (r.checklistLevel ?? "Loan") === activeLevel),
    [records, activeLevel],
  );

  useEffect(() => {
    if (!selectedId && visibleRecords.length > 0) {
      setSelectedId(visibleRecords[0]._id);
    }
    if (selectedId && !visibleRecords.find((r) => r._id === selectedId)) {
      setSelectedId(visibleRecords[0]?._id ?? null);
    }
  }, [visibleRecords, selectedId]);

  const defaultMeta: YamlMeta = useMemo(
    () => ({
      storyId: "SC-CONFIG-001",
      title: `Smart Checklist Requirements — ${project?.name ?? ""}`,
      featureArea: "smart-checklist",
    }),
    [project?.name],
  );

  const checklistRows = useMemo<ChecklistRecord[]>(
    () =>
      (records ?? []).map((r) => ({
        name: r.name,
        checklistLevel: (r.checklistLevel as ChecklistLevel | undefined) ?? "Loan",
        category: r.category,
        assignedParty: r.assignedParty,
        neededBy: r.neededBy,
        description: r.description,
        legalDescription: r.legalDescription,
        stageCheck: r.stageCheck,
        doNotAutoGenerate: r.doNotAutoGenerate,
        criteriaUserWritten: r.criteriaUserWritten,
        criteriaGenerated: r.criteriaGenerated,
        placeholderName: r.placeholderName,
      })),
    [records],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildChecklistYaml(checklistRows, meta, picklistMap),
    [checklistRows, picklistMap],
  );

  function parseImportFile(text: string, filename: string): ChecklistRecord[] | string {
    if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
      return parseChecklistYaml(text);
    }
    return parseChecklistCsvExcel(text);
  }

  async function handleImportConfirm(rows: ChecklistRecord[], mode: ImportMode) {
    if (!cardId) return;
    await bulkImport({ cardId, mode, records: rows });
    toast.success(`Imported ${rows.length} requirement${rows.length !== 1 ? "s" : ""}`);
  }

  if (!cardId) {
    return (
      <div className="p-8 text-sm text-slate-600">
        This page expects a <code>?cardId=…</code> query parameter — open it
        from a checklist card in the heatmap.
      </div>
    );
  }
  if (project === undefined || records === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const selected = records.find((r) => r._id === selectedId) ?? null;

  async function handleAdd() {
    if (!cardId) return;
    const id = await create({ cardId, name: "Untitled requirement" });
    await update({ id, checklistLevel: activeLevel });
    setSelectedId(id);
    toast.success("Requirement added");
  }

  async function handleDelete(id: Id<"checklistReqs">) {
    if (!confirm("Delete this requirement?")) return;
    await remove({ id });
  }

  return (
    <div className="pb-6">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Smart Checklist — {project.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPicklistOpen(true)} disabled={isLocked}>
            Manage picklists
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>
            Import
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadChecklistExcel(checklistRows, picklistMap)}
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
            disabled={isLocked}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            + Add requirement
          </Button>
        </div>
      </div>

      {/* Level tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {CHECKLIST_LEVELS.map((level) => {
          const count = (records ?? []).filter((r) => (r.checklistLevel ?? "Loan") === level).length;
          return (
            <button
              key={level}
              onClick={() => setActiveLevel(level)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeLevel === level
                  ? "border-b-2 border-[var(--color-blue)] text-[var(--color-blue)]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {level} <span className="ml-1 text-xs text-slate-400">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[280px_1fr]">
        {/* List */}
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {visibleRecords.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No {activeLevel.toLowerCase()} requirements yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleRecords.map((req) => (
                <li
                  key={req._id}
                  className={`flex items-start gap-2 px-3 py-2 hover:bg-slate-50 ${
                    req._id === selectedId ? "bg-[var(--color-blue)]/10" : ""
                  }`}
                >
                  <button
                    onClick={() => setSelectedId(req._id)}
                    className="flex-1 text-left text-sm"
                  >
                    <div
                      className={
                        req.name.trim()
                          ? "font-medium text-slate-900"
                          : "italic text-slate-400"
                      }
                    >
                      {req.name.trim() || "Untitled requirement"}
                    </div>
                  </button>
                  {!isLocked && (
                    <button
                      onClick={() => handleDelete(req._id)}
                      className="rounded px-1 text-xs text-red-500 hover:bg-red-50"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <RequirementDetail
              key={selected._id}
              record={selected}
              allRecords={records}
              picklistMap={picklistMap}
              isLocked={isLocked}
            />
          ) : (
            <div className="text-sm text-slate-500">
              Add a requirement to get started.
            </div>
          )}
        </div>
      </div>

      <PicklistEditor
        open={picklistOpen}
        onOpenChange={setPicklistOpen}
        scope="checklist"
        labels={CHECKLIST_PICKLIST_LABELS}
        defaults={CHECKLIST_PICKLISTS}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) =>
          downloadChecklistYaml(checklistRows, meta, picklistMap)
        }
      />

      <ImportDialog<ChecklistRecord>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Checklist Requirements"
        acceptFileTypes=".yaml,.yml,.xls,.csv"
        parseFile={parseImportFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0">
            <span className="font-medium">{r.name}</span>
            {r.assignedParty && (
              <span className="ml-2 text-xs text-slate-500">
                — {r.assignedParty}
              </span>
            )}
          </div>
        )}
      />
      </div>
    </div>
  );
}

function RequirementDetail({
  record,
  allRecords,
  picklistMap,
  isLocked,
}: {
  record: Doc<"checklistReqs">;
  allRecords: Doc<"checklistReqs">[];
  picklistMap: Map<string, string[]>;
  isLocked: boolean;
}) {
  const update = useMutation(api.checklist.update);

  const [name, setName] = useState(record.name);
  const [category, setCategory] = useState(record.category ?? "");
  const [assignedParty, setAssignedParty] = useState(record.assignedParty ?? "");
  const [neededBy, setNeededBy] = useState(record.neededBy ?? "");
  const [description, setDescription] = useState(record.description ?? "");
  const [legalDescription, setLegalDescription] = useState(record.legalDescription ?? "");
  const [stageCheck, setStageCheck] = useState(record.stageCheck ?? false);
  const [doNotAutoGenerate, setDoNotAutoGenerate] = useState(record.doNotAutoGenerate ?? false);
  const [criteriaUserWritten, setCriteriaUserWritten] = useState(record.criteriaUserWritten ?? "");
  const [criteriaGenerated, setCriteriaGenerated] = useState(record.criteriaGenerated ?? "");
  const [placeholderName, setPlaceholderName] = useState(record.placeholderName ?? "");

  async function persist() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required.");
      return;
    }
    const level = record.checklistLevel ?? "Loan";
    const duplicate = allRecords.find(
      (r) => r._id !== record._id &&
        (r.checklistLevel ?? "Loan") === level &&
        r.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      toast.error(`A ${level} requirement named "${trimmed}" already exists.`);
      return;
    }
    await update({
      id: record._id,
      name: trimmed,
      category: category || undefined,
      assignedParty: assignedParty || undefined,
      neededBy: neededBy || undefined,
      description: description || undefined,
      legalDescription: legalDescription || undefined,
      stageCheck,
      doNotAutoGenerate,
      criteriaUserWritten: criteriaUserWritten || undefined,
      criteriaGenerated: criteriaGenerated || undefined,
      placeholderName: placeholderName || undefined,
    });
    toast.success("Saved");
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="req-name">Name <span className="text-red-500">*</span></Label>
        <Input
          id="req-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={persist}
          disabled={isLocked}
          className={!name.trim() ? "border-red-400 focus:border-red-400" : ""}
        />
        {!name.trim() && (
          <p className="mt-1 text-xs text-red-500">Name is required.</p>
        )}
      </div>
      <div>
        <PicklistField id="req-category" label="Category" value={category} onChange={setCategory} options={picklistMap.get("category") ?? []} disabled={isLocked} />
      </div>
      <div>
        <PicklistField id="req-assignee" label="Assignee" value={assignedParty} onChange={setAssignedParty} options={picklistMap.get("assignedParty") ?? []} disabled={isLocked} />
      </div>
      <div>
        <Label htmlFor="req-desc">Description</Label>
        <Textarea
          id="req-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={persist}
          disabled={isLocked}
        />
      </div>
      <div>
        <Label htmlFor="req-legal-desc">Legal Description</Label>
        <Textarea
          id="req-legal-desc"
          rows={2}
          value={legalDescription}
          onChange={(e) => setLegalDescription(e.target.value)}
          onBlur={persist}
          disabled={isLocked}
        />
      </div>
      <div>
        <PicklistField id="req-placeholder" label="Document Manager Placeholder" value={placeholderName} onChange={setPlaceholderName} options={picklistMap.get("placeholderName") ?? []} disabled={isLocked} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="req-criteria-written">Criteria (human-readable)</Label>
          <Textarea
            id="req-criteria-written"
            rows={2}
            value={criteriaUserWritten}
            onChange={(e) => setCriteriaUserWritten(e.target.value)}
            onBlur={persist}
            disabled={isLocked}
          />
        </div>
        <div>
          <Label htmlFor="req-criteria-gen">Advanced Criteria (SOQL/formula)</Label>
          <Textarea
            id="req-criteria-gen"
            rows={2}
            value={criteriaGenerated}
            onChange={(e) => setCriteriaGenerated(e.target.value)}
            onBlur={persist}
            disabled={isLocked}
          />
        </div>
      </div>
      <div className="flex gap-6 text-sm">
        <label className={`flex items-center gap-2 ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={stageCheck}
            onChange={(e) => {
              const checked = e.target.checked;
              setStageCheck(checked);
              if (!checked) setNeededBy("");
            }}
            onBlur={persist}
            disabled={isLocked}
          />
          Hard Stop
        </label>
        <label className={`flex items-center gap-2 ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={doNotAutoGenerate}
            onChange={(e) => setDoNotAutoGenerate(e.target.checked)}
            onBlur={persist}
            disabled={isLocked}
          />
          Do Not Auto-Generate
        </label>
      </div>
      {stageCheck && (
        <PicklistField id="req-needed-by" label="Needed By" value={neededBy} onChange={setNeededBy} options={picklistMap.get("neededBy") ?? []} disabled={isLocked} />
      )}
      {!isLocked && (
        <div className="flex justify-end pt-2">
          <Button onClick={persist}>Save</Button>
        </div>
      )}
    </div>
  );
}

function PicklistField({
  id, label, value, onChange, options, disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || null}
        onValueChange={(v: string | null) => onChange(v ?? "")}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>—</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
