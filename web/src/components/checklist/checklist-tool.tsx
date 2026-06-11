"use client";

import Link from "next/link";
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
import { ExportButton } from "@/components/ui/export-button";
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
import { translateCriteria } from "@/lib/formgen";
import {
  HelpDialog,
  HelpSection,
  HelpBullets,
  HelpTip,
  HelpTable,
  HelpScreenshot,
} from "@/components/ui/help-dialog";

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
  const syncDocmanPlaceholders = useMutation(api.docman.syncFromChecklist);

  const docmanPlaceholders = useQuery(api.docman.listPlaceholdersForProject, { projectId }) ?? [];

  const [activeLevel, setActiveLevel] = useState<ChecklistLevel>("Loan");
  const [selectedId, setSelectedId] = useState<Id<"checklistReqs"> | null>(null);
  const [picklistOpen, setPicklistOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "checklist");

  const stored = useQuery(api.picklists.listForScope, { scope: "checklist" });
  const stagesData = useQuery(api.stages.listForProject, { projectId });
  const picklistMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of Object.keys(CHECKLIST_PICKLISTS)) {
      m.set(k, CHECKLIST_PICKLISTS[k]);
    }
    if (stored) for (const p of stored) m.set(p.key, p.values);
    // neededBy is always driven by stages — override any stored/default values
    if (stagesData) {
      m.set("neededBy", stagesData.stages.map((s) => s.name));
    }
    return m;
  }, [stored, stagesData]);

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
        assignedParty: r.assignedParty,
        neededBy: r.neededBy,
        description: r.description,
        stageCheck: r.stageCheck,
        doNotAutoGenerate: r.doNotAutoGenerate,
        criteriaUserWritten: r.criteriaUserWritten,
        criteriaGenerated: r.criteriaGenerated,
        placeholderName: r.placeholderName,
      })),
    [records],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildChecklistYaml(checklistRows, meta, picklistMap, docmanPlaceholders),
    [checklistRows, picklistMap, docmanPlaceholders],
  );

  function parseImportFile(text: string, filename: string): ChecklistRecord[] | string {
    if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
      return parseChecklistYaml(text);
    }
    return parseChecklistCsvExcel(text);
  }

  async function handleImportConfirm(rows: ChecklistRecord[], mode: ImportMode) {
    if (!cardId) return;
    // Auto-generate criteriaGenerated from criteriaUserWritten when absent
    const enriched = rows.map((r) => ({
      ...r,
      criteriaGenerated: r.criteriaGenerated || (r.criteriaUserWritten ? translateCriteria(r.criteriaUserWritten) : undefined) || undefined,
    }));
    await bulkImport({ cardId, mode, records: enriched });

    // Sync any new placeholder names to the Document Manager placeholder builder
    const placeholderNames = [...new Set(rows.map((r) => r.placeholderName).filter(Boolean))] as string[];

    if (placeholderNames.length) {
      // Sync to Document Manager placeholder builder: Loan → Loans, Relationship → Relationships
      const docmanPlaceholders = rows
        .filter((r) => r.placeholderName)
        .map((r) => ({
          name: r.placeholderName!,
          level: (r.checklistLevel === "Relationship" ? "Relationships" : "Loans") as "Loans" | "Relationships",
        }));
      // Deduplicate by name+level
      const seen = new Set<string>();
      const unique = docmanPlaceholders.filter(({ name, level }) => {
        const key = `${name}::${level}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      await syncDocmanPlaceholders({ projectId, placeholders: unique });
    }

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
          <ExportButton
            disabled={records.length === 0}
            onExcelClick={() => downloadChecklistExcel(checklistRows, picklistMap, docmanPlaceholders)}
            onYamlClick={() => setYamlOpen(true)}
          />
          <Button variant="outline" onClick={() => setHelpOpen(true)}>? Help</Button>
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
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-y-auto" style={{ maxHeight: "calc(13 * 2.25rem)" }}>
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
              projectId={projectId}
              docmanPlaceholders={docmanPlaceholders}
              syncDocmanPlaceholders={syncDocmanPlaceholders}
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
          downloadChecklistYaml(checklistRows, meta, picklistMap, docmanPlaceholders)
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

      <ChecklistHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </div>
  );
}

function ChecklistHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <HelpDialog open={open} onOpenChange={onOpenChange} title="Smart Checklist Builder — Help">
      <HelpSection title="What is Smart Checklist?">
        <p>Smart Checklist is nCino&apos;s task-tracking module on a loan record. It lists named requirements that must be completed, waived, or flagged as an exception as the deal progresses through stages. Requirements can be linked to Document Manager placeholders so uploading a document automatically marks the checklist item.</p>
      </HelpSection>

      <HelpScreenshot src="/help-checklist.png" alt="Smart Checklist on a loan" caption="Smart Checklist panel on a loan record in nCino" />

      <HelpSection title="What does this builder configure?">
        <HelpTable rows={[
          ["Requirement Name", "The label shown on the checklist item on the loan record."],
          ["Level", "Loan or Relationship — determines which object tab the requirement appears on."],
          ["Assigned Party", "The role responsible for completing this requirement."],
          ["Needed By", "Which stage this requirement should be resolved by."],
          ["Stage Check", "Whether the requirement must be cleared before advancing to the next stage."],
          ["Placeholder", "Links this requirement to a Document Manager placeholder. Uploading the document marks this item complete."],
          ["Description", "Guidance text shown alongside the requirement on the loan."],
        ]} />
      </HelpSection>

      <HelpSection title="How to use this builder">
        <p><strong>Manage picklists</strong> — opens the picklist editor to configure the available values for Assigned Party, Status, and other dropdown fields used on checklist items.</p>
        <p><strong>Import</strong> — import requirements from a YAML, XLS, or CSV export to bulk-load your checklist configuration.</p>
        <p><strong>Export</strong> — downloads all requirements and picklist values as Excel or YAML.</p>
        <p><strong>+ Add requirement</strong> — creates a new checklist requirement. Fill in the fields in the detail panel on the right.</p>
        <p>Use the <strong>Loan / Relationship tabs</strong> to switch between the two levels. Items are saved per level independently.</p>
      </HelpSection>

      <HelpTip>In nCino, configure Smart Checklist requirements under <strong>nCino Admin &gt; Smart Checklist</strong>. The &ldquo;Needed By&rdquo; picklist is driven by the stages you configure in the Stages &amp; UI Builder.</HelpTip>
    </HelpDialog>
  );
}

function RequirementDetail({
  record,
  allRecords,
  picklistMap,
  isLocked,
  projectId,
  docmanPlaceholders,
  syncDocmanPlaceholders,
}: {
  record: Doc<"checklistReqs">;
  allRecords: Doc<"checklistReqs">[];
  picklistMap: Map<string, string[]>;
  isLocked: boolean;
  projectId: Id<"projects">;
  docmanPlaceholders: { _id: string; name: string; level: string }[];
  syncDocmanPlaceholders: (args: { projectId: Id<"projects">; placeholders: { name: string; level: "Loans" | "Relationships" }[] }) => Promise<unknown>;
}) {
  const update = useMutation(api.checklist.update);

  const [name, setName] = useState(record.name);
  const [assignedParty, setAssignedParty] = useState(record.assignedParty ?? "");
  const [neededBy, setNeededBy] = useState(record.neededBy ?? "");
  const [description, setDescription] = useState(record.description ?? "");
  const [stageCheck, setStageCheck] = useState(record.stageCheck ?? false);
  const [doNotAutoGenerate, setDoNotAutoGenerate] = useState(record.doNotAutoGenerate ?? false);
  const [criteriaUserWritten, setCriteriaUserWritten] = useState(record.criteriaUserWritten ?? "");
  const [criteriaGenerated, setCriteriaGenerated] = useState(record.criteriaGenerated ?? "");
  const [placeholderName, setPlaceholderName] = useState(record.placeholderName ?? "");
  const [addingNewPlaceholder, setAddingNewPlaceholder] = useState(false);
  const [newPlaceholderInput, setNewPlaceholderInput] = useState("");

  const checklistLevel = record.checklistLevel ?? "Loan";
  const docmanLevel = checklistLevel === "Relationship" ? "Relationships" : "Loans";

  // Placeholders from Document Manager filtered to this checklist level
  const levelDocmanOptions = useMemo(
    () => [...new Set(docmanPlaceholders.filter((p) => p.level === docmanLevel).map((p) => p.name))].sort(),
    [docmanPlaceholders, docmanLevel],
  );

  async function handleAddNewPlaceholder() {
    const trimmed = newPlaceholderInput.trim();
    if (!trimmed) return;
    setPlaceholderName(trimmed);
    setNewPlaceholderInput("");
    setAddingNewPlaceholder(false);
    // Sync to docman builder if it doesn't already exist at this level
    const exists = docmanPlaceholders.some((p) => p.name === trimmed && p.level === docmanLevel);
    if (!exists) {
      await syncDocmanPlaceholders({ projectId, placeholders: [{ name: trimmed, level: docmanLevel }] });
    }
    // Persist immediately
    await update({
      id: record._id,
      placeholderName: trimmed,
    });
    toast.success("Placeholder saved");
  }

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
      assignedParty: assignedParty || undefined,
      neededBy: neededBy || undefined,
      description: description || undefined,
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
        <Label>Document Manager Placeholder</Label>
        <Select
          value={addingNewPlaceholder ? "__add_new__" : (placeholderName || null)}
          onValueChange={async (v: string | null) => {
            if (v === "__add_new__") {
              setAddingNewPlaceholder(true);
              setNewPlaceholderInput("");
              return;
            }
            setAddingNewPlaceholder(false);
            setNewPlaceholderInput("");
            const val = v ?? "";
            setPlaceholderName(val);
            await update({ id: record._id, placeholderName: val || undefined });
          }}
          disabled={isLocked || addingNewPlaceholder}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select from Document Manager…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>— None —</SelectItem>
            {!isLocked && (
              <SelectItem value="__add_new__">
                <span className="flex items-center gap-2 text-[var(--color-blue)] font-medium">
                  <span className="text-base leading-none">+</span> Add a new placeholder…
                </span>
              </SelectItem>
            )}
            {levelDocmanOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {addingNewPlaceholder && (
          <div className="mt-1.5 flex gap-1.5">
            <Input
              autoFocus
              value={newPlaceholderInput}
              onChange={(e) => setNewPlaceholderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddNewPlaceholder(); }
                if (e.key === "Escape") { setAddingNewPlaceholder(false); setNewPlaceholderInput(""); }
              }}
              placeholder="Type new placeholder name…"
              className="h-7 text-xs"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddNewPlaceholder}
              disabled={!newPlaceholderInput.trim()}
              className="h-7 px-2 text-xs shrink-0"
            >Add</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setAddingNewPlaceholder(false); setNewPlaceholderInput(""); }}
              className="h-7 px-2 text-xs shrink-0 text-slate-400"
            >Cancel</Button>
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-400 leading-snug">
          Only {docmanLevel.toLowerCase()} placeholders are shown. New placeholders are automatically added to the Document Manager builder under <span className="font-medium">Placeholder Builder &rarr; No category</span>. On import, any placeholder not yet in Document Manager will also be added there.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="req-criteria-written">Criteria (human-readable)</Label>
          <Textarea
            id="req-criteria-written"
            rows={2}
            value={criteriaUserWritten}
            onChange={(e) => setCriteriaUserWritten(e.target.value)}
            onBlur={() => {
              const generated = translateCriteria(criteriaUserWritten);
              if (generated) setCriteriaGenerated(generated);
              persist();
            }}
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
        <div>
          <PicklistField id="req-needed-by" label="Needed By" value={neededBy} onChange={setNeededBy} options={picklistMap.get("neededBy") ?? []} disabled={isLocked} />
          <p className="mt-1 text-xs text-slate-400">
            Stages are managed in the{" "}
            <Link href={`/projects/${projectId}/stages`} className="font-medium text-[var(--color-blue)] hover:underline">
              Stages &amp; UI Builder →
            </Link>
          </p>
        </div>
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

// ── Smart Checklist Preview Playground ───────────────────────────────────────

export function ChecklistPreviewPlayground({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const allRecords = useQuery(api.checklist.listForProject, { projectId });

  // Only show Loan-level items with no criteria (always generated)
  const alwaysOn = useMemo(
    () =>
      (allRecords ?? []).filter(
        (r) =>
          (r.checklistLevel ?? "Loan") === "Loan" &&
          !r.criteriaUserWritten?.trim() &&
          !r.criteriaGenerated?.trim(),
      ),
    [allRecords],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? alwaysOn.filter((r) => r.name.toLowerCase().includes(q)) : alwaysOn;
  }, [alwaysOn, search]);

  // Auto-select first
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0]._id);
    if (selectedId && !filtered.find((r) => r._id === selectedId)) setSelectedId(filtered[0]?._id ?? null);
  }, [filtered, selectedId]);

  const selected = filtered.find((r) => r._id === selectedId) ?? null;

  return (
    <div className="max-w-5xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Showing Loan requirements that apply to all loans (no criteria set).
        </span>
      </div>

      <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" style={{ height: "420px" }}>
        {/* Left: requirement list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-slate-200">
          <div className="border-b border-slate-200 p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requirements…"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-[var(--color-blue)] focus:outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {allRecords === undefined ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400 italic">
                {alwaysOn.length === 0
                  ? "No always-on Loan requirements configured yet."
                  : "No matches."}
              </div>
            ) : (
              filtered.map((r) => (
                <button
                  key={r._id}
                  onClick={() => setSelectedId(r._id)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    r._id === selectedId
                      ? "bg-[var(--color-blue)]/8 border-l-2 border-[var(--color-blue)]"
                      : "hover:bg-slate-50 border-l-2 border-transparent"
                  }`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className={`text-sm ${r._id === selectedId ? "font-medium text-[var(--color-blue)]" : "text-slate-800"}`}>
                    {r.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 overflow-y-auto p-5">
          {selected ? (
            <div>
              <h4 className="mb-4 text-base font-semibold text-slate-900">{selected.name}</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <DetailField label="Assignee" value={selected.assignedParty} />
                <DetailField label="Description" value={selected.description} wide />
                <DetailField label="Document Manager Placeholder" value={selected.placeholderName} wide />
                <div className="col-span-2 flex gap-6">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={!!selected.stageCheck} readOnly className="rounded border-slate-300" />
                    <span className="text-slate-600">Hard Stop</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={!!selected.doNotAutoGenerate} readOnly className="rounded border-slate-300" />
                    <span className="text-slate-600">Do Not Auto-Generate</span>
                  </div>
                </div>
                {selected.stageCheck && selected.neededBy && (
                  <DetailField label="Needed By" value={selected.neededBy} />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400 italic">
              Select a requirement to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="mb-0.5 text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value || <span className="italic text-slate-400">—</span>}</p>
    </div>
  );
}
