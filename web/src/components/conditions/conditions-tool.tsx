"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaygroundState } from "@/components/stages/playground-state-context";
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
  CONDITIONS_PICKLISTS,
  CONDITIONS_PICKLIST_LABELS,
} from "@/lib/picklist-defaults";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import { ExportButton } from "@/components/ui/export-button";
import {
  buildConditionsYaml,
  downloadConditionsYaml,
  downloadConditionsExcel,
  parseConditionsYaml,
  parseConditionsCsvExcel,
  type ConditionRecord,
  type ConditionType,
} from "@/lib/export-import";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
import {
  HelpDialog,
  HelpSection,
  HelpTip,
  HelpTable,
  HelpScreenshot,
} from "@/components/ui/help-dialog";

const CONDITION_TYPES: ConditionType[] = ["Condition Precedent", "Condition Subsequent"];

export function ConditionsTool({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const project = useQuery(api.projects.get, { id: projectId });
  const records = useQuery(api.conditions.listForProject, { projectId });
  const create = useMutation(api.conditions.create);
  const update = useMutation(api.conditions.update);
  const remove = useMutation(api.conditions.remove);
  const bulkImport = useMutation(api.conditions.bulkImport);
  const setPicklistValues = useMutation(api.picklists.setValues);

  const [activeType, setActiveType] = useState<ConditionType>("Condition Precedent");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<Id<"conditionReqs"> | null>(null);
  const [picklistOpen, setPicklistOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "conditions");

  const stored = useQuery(api.picklists.listForScope, { scope: "conditions" });
  const picklistMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of Object.keys(CONDITIONS_PICKLISTS)) {
      m.set(k, CONDITIONS_PICKLISTS[k]);
    }
    if (stored) for (const p of stored) m.set(p.key, p.values);
    return m;
  }, [stored]);

  const typeRecords = useMemo(
    () => (records ?? []).filter((r) => r.conditionType === activeType),
    [records, activeType],
  );

  const availableCategories = useMemo(
    () => [...new Set(typeRecords.map((r) => r.category).filter(Boolean) as string[])].sort(),
    [typeRecords],
  );

  const visibleRecords = useMemo(
    () => categoryFilter ? typeRecords.filter((r) => r.category === categoryFilter) : typeRecords,
    [typeRecords, categoryFilter],
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
      storyId: "COND-CONFIG-001",
      title: `Loan Conditions — ${project?.name ?? ""}`,
      featureArea: "conditions",
    }),
    [project?.name],
  );

  const conditionRows = useMemo<ConditionRecord[]>(
    () =>
      (records ?? []).map((r) => ({
        name: r.name,
        conditionType: r.conditionType as ConditionType,
        category: r.category,
        assignedParty: r.assignedParty,
        description: r.description,
        legalDescription: r.legalDescription,
      })),
    [records],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildConditionsYaml(conditionRows, meta),
    [conditionRows],
  );

  function parseImportFile(text: string, filename: string): ConditionRecord[] | string {
    if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
      return parseConditionsYaml(text);
    }
    return parseConditionsCsvExcel(text);
  }

  async function handleImportConfirm(rows: ConditionRecord[], mode: ImportMode) {
    await bulkImport({ projectId, mode, records: rows });

    // Merge any new categories into the full existing picklist list
    const existingCategories = picklistMap.get("category") ?? [];
    const importedCategories = [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])];
    const newCategories = importedCategories.filter((c) => !existingCategories.includes(c));
    if (newCategories.length) {
      await setPicklistValues({
        scope: "conditions",
        key: "category",
        values: [...existingCategories, ...newCategories],
      });
    }

    const suffix = newCategories.length
      ? ` (${newCategories.length} new categor${newCategories.length === 1 ? "y" : "ies"} added to picklist)`
      : "";
    toast.success(`Imported ${rows.length} condition${rows.length !== 1 ? "s" : ""}${suffix}`);
  }

  if (project === undefined || records === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const selected = records.find((r) => r._id === selectedId) ?? null;

  async function handleAdd() {
    const id = await create({ projectId, name: "Untitled condition", conditionType: activeType });
    setSelectedId(id);
    toast.success("Condition added");
  }

  async function handleDelete(id: Id<"conditionReqs">) {
    if (!confirm("Delete this condition?")) return;
    await remove({ id });
  }

  return (
    <div className="flex h-full flex-col">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Conditions Builder — {project.name}
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
            onExcelClick={() => downloadConditionsExcel(conditionRows)}
            onYamlClick={() => setYamlOpen(true)}
          />
          <Button variant="outline" onClick={() => setHelpOpen(true)}>? Help</Button>
          <Button
            onClick={handleAdd}
            disabled={isLocked}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            + Add condition
          </Button>
        </div>
      </div>

      {/* Condition type tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {CONDITION_TYPES.map((type) => {
          const count = (records ?? []).filter((r) => r.conditionType === type).length;
          return (
            <button
              key={type}
              onClick={() => { setActiveType(type); setCategoryFilter(""); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeType === type
                  ? "border-b-2 border-[var(--color-blue)] text-[var(--color-blue)]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {type} <span className="ml-1 text-xs text-slate-400">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Category filter */}
      {availableCategories.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0">Filter by category:</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setCategoryFilter("")}
              className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                !categoryFilter
                  ? "bg-[var(--color-blue)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? "" : cat)}
                className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? "bg-[var(--color-blue)] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[280px_1fr]">
        {/* List */}
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {visibleRecords.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No {activeType.toLowerCase()} conditions yet.
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
                      {req.name.trim() || "Untitled condition"}
                    </div>
                    {req.taskType && (
                      <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {req.taskType}
                      </span>
                    )}
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
            <ConditionDetail
              key={selected._id}
              record={selected}
              allRecords={records}
              picklistMap={picklistMap}
              isLocked={isLocked}
            />
          ) : (
            <div className="text-sm text-slate-500">
              Add a condition to get started.
            </div>
          )}
        </div>
      </div>

      <PicklistEditor
        open={picklistOpen}
        onOpenChange={setPicklistOpen}
        scope="conditions"
        labels={CONDITIONS_PICKLIST_LABELS}
        defaults={CONDITIONS_PICKLISTS}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadConditionsYaml(conditionRows, meta)}
      />

      <ImportDialog<ConditionRecord>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Conditions"
        acceptFileTypes=".yaml,.yml,.xls,.csv"
        parseFile={parseImportFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0">
            <span className="font-medium">{r.name}</span>
            {r.taskType && (
              <span className="ml-2 text-xs text-slate-500">— {r.taskType}</span>
            )}
            <span className="ml-2 text-xs text-slate-400">({r.conditionType})</span>
          </div>
        )}
      />

      <ConditionsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </div>
  );
}

function ConditionsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <HelpDialog open={open} onOpenChange={onOpenChange} title="Conditions Builder — Help">
      <HelpSection title="What are Conditions?">
        <p>Conditions are formal requirements placed on a loan that must be satisfied before or after it closes. They carry legal weight and are formally tracked with named parties and due dates. Conditions are distinct from Smart Checklist items — they represent contractual obligations rather than process tasks.</p>
      </HelpSection>

      <HelpScreenshot src="/help-conditions.png" alt="Conditions on a loan" caption="Conditions panel on a loan record in nCino" />

      <HelpSection title="Key concepts">
        <HelpTable rows={[
          ["Condition Precedent", "Must be met before a key milestone, typically drawdown. Shown on the 'Condition Precedent' tab."],
          ["Condition Subsequent", "Must be met after booking or completion. Shown on the 'Condition Subsequent' tab."],
          ["Task Type", "Sub-category label shown on the condition row (e.g. Pre-offer, Post-offer). Configurable via Manage picklists."],
          ["Assigned Party", "The role responsible for clearing the condition."],
          ["Days After Booking", "For Condition Subsequent — how many days post-booking the condition falls due."],
        ]} />
      </HelpSection>

      <HelpSection title="How to use this builder">
        <p><strong>Manage picklists</strong> — opens the picklist editor to configure available values for Task Type, Assigned Party, Status, and other dropdown fields used on condition records.</p>
        <p><strong>Import</strong> — import conditions from a YAML, XLS, or CSV export to bulk-load your configuration.</p>
        <p><strong>Export</strong> — downloads all conditions and picklist values as Excel or YAML.</p>
        <p><strong>+ Add condition</strong> — creates a new condition. Fill in the fields in the detail panel on the right. Use the <strong>Condition Precedent / Condition Subsequent</strong> tabs to switch between the two types.</p>
      </HelpSection>

      <HelpTip>In nCino, configure conditions under <strong>nCino Admin &gt; Conditions</strong>. Task Type values map to the Task Type picklist on the Condition record.</HelpTip>
    </HelpDialog>
  );
}

function ConditionDetail({
  record,
  allRecords,
  picklistMap,
  isLocked,
}: {
  record: Doc<"conditionReqs">;
  allRecords: Doc<"conditionReqs">[];
  picklistMap: Map<string, string[]>;
  isLocked: boolean;
}) {
  const update = useMutation(api.conditions.update);

  const [name, setName] = useState(record.name);
  const [category, setCategory] = useState(record.category ?? "");
  const [assignedParty, setAssignedParty] = useState(record.assignedParty ?? "");
  const [description, setDescription] = useState(record.description ?? "");
  const [legalDescription, setLegalDescription] = useState(record.legalDescription ?? "");

  async function persist() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required.");
      return;
    }
    const duplicate = allRecords.find(
      (r) =>
        r._id !== record._id &&
        r.conditionType === record.conditionType &&
        r.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      toast.error(
        `A ${record.conditionType} condition named "${trimmed}" already exists.`,
      );
      return;
    }
    await update({
      id: record._id,
      name: trimmed,
      category: category || undefined,
      assignedParty: assignedParty || undefined,
      description: description || undefined,
      legalDescription: legalDescription || undefined,
    });
    toast.success("Saved");
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="cond-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="cond-name"
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
        <PicklistField
          id="cond-category"
          label="Category"
          value={category}
          onChange={setCategory}
          options={picklistMap.get("category") ?? []}
          disabled={isLocked}
        />
      </div>
      <div>
        <PicklistField
          id="cond-assigned-party"
          label="Assigned Party"
          value={assignedParty}
          onChange={setAssignedParty}
          options={picklistMap.get("assignedParty") ?? []}
          disabled={isLocked}
        />
      </div>
      <div>
        <Label htmlFor="cond-desc">Description</Label>
        <Textarea
          id="cond-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={persist}
          disabled={isLocked}
        />
      </div>
      <div>
        <Label htmlFor="cond-legal-desc">Legal Description</Label>
        <Textarea
          id="cond-legal-desc"
          rows={2}
          value={legalDescription}
          onChange={(e) => setLegalDescription(e.target.value)}
          onBlur={persist}
          disabled={isLocked}
        />
      </div>
      {!isLocked && (
        <div className="flex justify-end pt-2">
          <Button onClick={persist}>Save</Button>
        </div>
      )}
    </div>
  );
}

function PicklistField({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
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

// ── Conditions Preview Playground ─────────────────────────────────────────────

type PreviewCondition = {
  id: string;
  name: string;
  description?: string;
  taskType?: string;
  category?: string;
  conditionType: string;
};

export function ConditionsPreviewPlayground({ projectId }: { projectId: Id<"projects"> }) {
  const records = useQuery(api.conditions.listForProject, { projectId });
  const stored = useQuery(api.picklists.listForScope, { scope: "conditions" });

  const categoryOptions = useMemo(() => {
    const fromPicklist = stored?.find((p) => p.key === "category")?.values
      ?? CONDITIONS_PICKLISTS["category"] ?? [];
    const fromRecords = [...new Set((records ?? []).map((r) => r.category).filter(Boolean) as string[])];
    return [...new Set([...fromPicklist, ...fromRecords])].sort();
  }, [stored, records]);

  const { addedConditions: added, setAddedConditions: setAdded } = usePlaygroundState();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allConditions: PreviewCondition[] = useMemo(
    () => (records ?? []).map((r) => ({
      id: r._id,
      name: r.name,
      description: r.description,
      taskType: r.taskType,
      category: r.category,
      conditionType: r.conditionType,
    })),
    [records],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allConditions.filter((c) => {
      const matchesCat = categoryFilter === "all" || c.category === categoryFilter;
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [allConditions, search, categoryFilter]);

  function openDialog() {
    setSearch("");
    setCategoryFilter("all");
    setSelected(new Set());
    setDialogOpen(true);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  function handleClearSelection() {
    setSelected(new Set());
  }

  function handleAdd() {
    const toAdd = filtered.filter((c) => selected.has(c.id) && !added.find((a) => a.id === c.id));
    setAdded((prev) => [...prev, ...toAdd]);
    setDialogOpen(false);
  }

  function handleRemove(id: string) {
    setAdded((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Reflects your <span className="font-medium">Conditions Builder</span> config.
        </span>
        <Button onClick={openDialog} className="ml-auto bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]">
          + Add Conditions
        </Button>
      </div>

      {/* Added conditions table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_180px_140px_36px] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Name</span>
          <span>Description</span>
          <span>Task Type / Category</span>
          <span />
        </div>
        {added.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
            No conditions added yet — click <strong>+ Add Conditions</strong> to select from your library.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {added.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_180px_140px_36px] gap-2 items-start px-4 py-2.5 hover:bg-slate-50 group">
                <span className="text-sm font-medium text-slate-800">{c.name}</span>
                <span className="text-xs text-slate-500 line-clamp-2">{c.description || "—"}</span>
                <div className="flex flex-col gap-0.5">
                  {c.taskType && (
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 w-fit">{c.taskType}</span>
                  )}
                  {c.category && (
                    <span className="text-[10px] text-slate-400">{c.category}</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(c.id)}
                  className="mt-0.5 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Conditions dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="!max-w-3xl !max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Conditions</DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">Select one or more conditions from the list</p>
          </DialogHeader>

          {/* Search + category filter */}
          <div className="flex gap-2 shrink-0">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] shrink-0"
            >
              <option value="all">All</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                autoFocus
                className="w-full rounded border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
              />
            </div>
          </div>

          {/* Selection controls */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500">{selected.size} item(s) selected</span>
            <button onClick={handleSelectAll} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">Select All</button>
            <button onClick={handleClearSelection} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">Clear Selection</button>
          </div>

          {/* Condition list */}
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200">
            {/* Column headers */}
            <div className="sticky top-0 grid grid-cols-[36px_1fr_1fr_120px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span />
              <span>Name</span>
              <span>Description</span>
              <span>Task Type</span>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
                No conditions match your search.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const isSelected = selected.has(c.id);
                  const alreadyAdded = !!added.find((a) => a.id === c.id);
                  return (
                    <li
                      key={c.id}
                      onClick={() => !alreadyAdded && toggleSelect(c.id)}
                      className={`grid grid-cols-[36px_1fr_1fr_120px] gap-2 items-start px-3 py-2.5 transition-colors ${
                        alreadyAdded
                          ? "opacity-40 cursor-not-allowed"
                          : isSelected
                          ? "bg-[var(--color-blue)]/8 cursor-pointer"
                          : "hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-center pt-0.5">
                        <div className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold transition-colors ${
                          isSelected
                            ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white"
                            : "border-slate-300 text-slate-400 hover:border-[var(--color-blue)]"
                        }`}>
                          {isSelected ? "✓" : "+"}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{c.name}</div>
                        {c.category && <div className="text-[10px] text-slate-400 mt-0.5">{c.category}</div>}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{c.description || "—"}</p>
                      <span className="text-xs text-slate-500">{c.taskType || "—"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 shrink-0 pt-1">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={selected.size === 0}
              onClick={handleAdd}
              className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
            >
              Add {selected.size > 0 ? `${selected.size} ` : ""}Condition{selected.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
