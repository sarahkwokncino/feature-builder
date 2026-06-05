"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import {
  buildDocmanYaml,
  downloadDocmanYaml,
  downloadDocmanExcel,
  parseDocmanYaml,
  parseDocmanExcel,
  type DocmanExport,
} from "@/lib/export-import";
import { toast } from "sonner";

type DocmanLevel = "Relationships" | "Loans" | "Collateral" | "Product Package";
type Placeholder = Doc<"docmanPlaceholders">;
type Group = Doc<"docmanGroups">;

const LEVEL_FIELD_MAP: Record<DocmanLevel, string> = {
  Relationships: "Account",
  Loans: "llc_bi__loan__c",
  Collateral: "LLC_BI__Collateral__c",
  "Product Package": "LLC_BI__Product_Package__c",
};

const LEVELS: DocmanLevel[] = ["Loans", "Relationships", "Collateral", "Product Package"];

const LEVEL_COLOURS: Record<DocmanLevel, { tab: string; badge: string; header: string }> = {
  Loans:            { tab: "border-green-500 text-green-700",  badge: "bg-green-100 text-green-700",  header: "bg-green-50 text-green-800" },
  Relationships:    { tab: "border-blue-500 text-blue-700",    badge: "bg-blue-100 text-blue-700",    header: "bg-blue-50 text-blue-800" },
  Collateral:       { tab: "border-amber-500 text-amber-700",  badge: "bg-amber-100 text-amber-700",  header: "bg-amber-50 text-amber-800" },
  "Product Package":{ tab: "border-purple-500 text-purple-700",badge: "bg-purple-100 text-purple-700",header: "bg-purple-50 text-purple-800" },
};

// ── Formgen translation ───────────────────────────────────────────────────────

const FIELD_MAP: Record<string, string> = {
  "product line":   "LLC_BI__Loan__c.LLC_BI__Product_Line__c",
  "product type":   "LLC_BI__Loan__c.LLC_BI__Product_Type__c",
  "product":        "LLC_BI__Loan__c.LLC_BI__Product__c",
  "employee loan":  "LLC_BI__Loan__c.LLC_BI__Employee_Loan__c",
  "loan type":      "LLC_BI__Loan__c.LLC_BI__Loan_Type__c",
  "stage":          "LLC_BI__Loan__c.LLC_BI__Stage__c",
  "loan purpose":   "LLC_BI__Loan__c.LLC_BI__Loan_Purpose__c",
  "collateral type":"LLC_BI__Loan__c.LLC_BI__Collateral_Type__c",
};

function resolveField(raw: string): string {
  return FIELD_MAP[raw.trim().toLowerCase()] ?? `LLC_BI__Loan__c.${raw.trim()}`;
}

function translateCriteria(english: string): string {
  if (!english.trim()) return "";
  const parts = english.split(/\b(AND|OR)\b/i);
  const conditions: { field: string; value: string; negate: boolean }[] = [];
  const connectors: string[] = [];
  for (const token of parts) {
    const t = token.trim();
    if (/^AND$/i.test(t)) { connectors.push("AND"); continue; }
    if (/^OR$/i.test(t))  { connectors.push("OR");  continue; }
    if (!t) continue;
    const m = t.match(/^(.+?)\s*(?:is(?:\s+not)?|!=|=)\s*(.+)$/i);
    if (!m) continue;
    const negate = /\bis\s+not\b/i.test(t) || t.includes("!=");
    conditions.push({ field: resolveField(m[1]), value: m[2].trim(), negate });
  }
  if (conditions.length === 0) return "";
  let expr = "1";
  for (let i = 1; i < conditions.length; i++) expr += ` ${connectors[i - 1] ?? "AND"} ${i + 1}`;
  const tags = conditions.map((c, i) =>
    `{{COND="${i + 1}" FIELD="${c.field}" IS="${c.value}"${c.negate ? ' NEGATE="True"' : ""}}}`,
  ).join("");
  return `{{IF="${expr}"}}${tags}__GUID__{{ENDIF}}`;
}

// ── Placeholder Builder Dialog ────────────────────────────────────────────────

function PlaceholderBuilderDialog({
  open,
  onOpenChange,
  placeholders,
  cardId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  placeholders: Placeholder[];
  cardId: Id<"cards">;
}) {
  const createPlaceholder = useMutation(api.docman.createPlaceholder);
  const updatePlaceholder = useMutation(api.docman.updatePlaceholder);
  const deletePlaceholder = useMutation(api.docman.deletePlaceholder);

  const [selectedLevel, setSelectedLevel] = useState<DocmanLevel>(LEVELS[0]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Categories added by the user but not yet backed by a placeholder
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<Id<"docmanPlaceholders"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const levelPlaceholders = placeholders.filter((p) => p.level === selectedLevel);

  // Merge categories from existing placeholders + locally added ones
  const categories = useMemo(() => {
    const fromPlaceholders = levelPlaceholders.map((p) => p.category).filter(Boolean) as string[];
    const merged = new Set([...fromPlaceholders, ...localCategories]);
    return [...merged].sort();
  }, [levelPlaceholders.map((p) => p.category).join(","), localCategories.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // When level changes, reset category selection and local categories
  function selectLevel(level: DocmanLevel) {
    setSelectedLevel(level);
    setSelectedCategory(null);
    setNewCategoryName("");
    setLocalCategories([]);
  }

  const filteredByCategory = selectedCategory
    ? levelPlaceholders.filter((p) => p.category === selectedCategory)
    : levelPlaceholders.filter((p) => !p.category);

  function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name || categories.includes(name)) return;
    setLocalCategories((prev) => [...prev, name]);
    setSelectedCategory(name);
    setNewCategoryName("");
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    await createPlaceholder({ cardId, name, level: selectedLevel, category: selectedCategory ?? undefined });
    setNewName("");
  }

  async function handleSaveEdit(id: Id<"docmanPlaceholders">) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    await updatePlaceholder({ id, name, category: editCategory || undefined });
    setEditingId(null);
  }

  // Count placeholders per category for the badge
  function catCount(cat: string | null) {
    return levelPlaceholders.filter((p) => (cat === null ? !p.category : p.category === cat)).length;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-4xl">
        <DialogHeader>
          <DialogTitle>Placeholder Builder</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-0 divide-x divide-slate-200 rounded-lg border border-slate-200 overflow-hidden min-h-[380px]">
          {/* Col 1: Level */}
          <div className="flex flex-col">
            <div className="bg-blue-50 border-b border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Level</p>
            </div>
            <ul className="flex-1 p-1.5 space-y-0.5">
              {LEVELS.map((level) => {
                const count = placeholders.filter((p) => p.level === level).length;
                return (
                  <li
                    key={level}
                    onClick={() => selectLevel(level)}
                    className={`flex items-center justify-between rounded px-3 py-2 cursor-pointer text-sm ${
                      selectedLevel === level
                        ? "bg-[var(--color-blue)]/10 text-[var(--color-blue)] font-medium"
                        : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <div>
                      <div>{level}</div>
                    </div>
                    {count > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_COLOURS[level].badge}`}>
                        {count}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Col 2: Category */}
          <div className="flex flex-col">
            <div className={`border-b border-slate-200 px-3 py-2 ${LEVEL_COLOURS[selectedLevel].header}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide">Category</p>
            </div>
            <ul className="flex-1 overflow-auto p-1.5 space-y-0.5">
              {/* "No category" option */}
              <li
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center justify-between rounded px-3 py-1.5 cursor-pointer text-sm ${
                  selectedCategory === null
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "hover:bg-slate-50 text-slate-500 italic"
                }`}
              >
                <span>No category</span>
                {catCount(null) > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-600">
                    {catCount(null)}
                  </span>
                )}
              </li>
              {categories.map((cat) => (
                <li
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center justify-between rounded px-3 py-1.5 cursor-pointer text-sm ${
                    selectedCategory === cat
                      ? `${LEVEL_COLOURS[selectedLevel].badge} font-medium`
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  {catCount(cat) > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ml-1 shrink-0 ${
                      selectedCategory === cat ? LEVEL_COLOURS[selectedLevel].badge : "bg-slate-100 text-slate-500"
                    }`}>
                      {catCount(cat)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 p-2 flex gap-1.5">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
                placeholder="New category…"
                className="h-7 text-xs"
              />
              <Button size="sm" onClick={handleAddCategory} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          </div>

          {/* Col 3: Placeholders */}
          <div className="flex flex-col">
            <div className={`border-b border-slate-200 px-3 py-2 ${LEVEL_COLOURS[selectedLevel].header}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide">
                Placeholders{selectedCategory ? ` — ${selectedCategory}` : " — No category"}
              </p>
              <p className="text-[10px] opacity-70 mt-0.5">LLC_BI__ClosingChecklist__c.Name</p>
            </div>
            <ul className="flex-1 overflow-auto p-1.5 space-y-0.5">
              {filteredByCategory.length === 0 && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">No placeholders yet.</li>
              )}
              {filteredByCategory.map((p) => (
                <li key={p._id} className="group flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-slate-50 text-slate-800">
                  {editingId === p._id ? (
                    <div className="flex flex-col gap-1 flex-1">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(p._id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => handleSaveEdit(p._id)}
                        placeholder="Name"
                        className="h-6 text-xs"
                      />
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder="Category (optional)"
                        className="h-6 text-xs"
                      />
                    </div>
                  ) : (
                    <span className="flex-1 truncate">{p.name}</span>
                  )}
                  {editingId !== p._id && (
                    <div className="hidden group-hover:flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingId(p._id); setEditName(p.name); setEditCategory(p.category ?? ""); }}
                        className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      >Edit</button>
                      <button onClick={() => deletePlaceholder({ id: p._id })}
                        className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50">✕</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 p-2 flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="Add placeholder…"
                className="h-7 text-xs"
              />
              <Button size="sm" onClick={handleAdd} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Conditional Group Editor ──────────────────────────────────────────────────

function ConditionalGroupEditor({
  group,
  levelPlaceholders,
  defaultPlaceholderIds,
  allGroups,
  onDelete,
}: {
  group: Group;
  levelPlaceholders: Placeholder[];
  defaultPlaceholderIds: Set<string>;
  onDelete: () => void;
}) {
  const updateGroup = useMutation(api.docman.updateGroup);

  const [name, setName] = useState(group.name);
  const [criteria, setCriteria] = useState(group.criteriaUserWritten ?? "");
  // selectedIds stores only the explicitly chosen (non-default) placeholders
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(group.placeholderIds.filter((id) => !defaultPlaceholderIds.has(id))),
  );

  const formgen = useMemo(() => translateCriteria(criteria), [criteria]);

  // Sync when server data changes (filter out any defaults that were stored)
  useEffect(() => {
    setSelectedIds(new Set(group.placeholderIds.filter((id) => !defaultPlaceholderIds.has(id))));
  }, [group.placeholderIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist() {
    // Auto-name from criteria if the user hasn't set a custom name yet
    const resolvedName = name.trim() === "New condition" && criteria.trim()
      ? criteria.trim()
      : name.trim() || group.name;
    if (resolvedName !== name.trim()) setName(resolvedName);
    await updateGroup({
      id: group._id,
      name: resolvedName,
      criteriaUserWritten: criteria || undefined,
      criteriaFormgen: formgen || undefined,
      placeholderIds: [...selectedIds],
    });
  }

  function togglePlaceholder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const defaultPhs = levelPlaceholders.filter((p) => defaultPlaceholderIds.has(p._id));
  const optionalPhs = levelPlaceholders.filter((p) => !defaultPlaceholderIds.has(p._id));

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={persist}
          className="h-7 text-sm font-medium flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          placeholder="Group name…"
        />
        <button onClick={onDelete} className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 shrink-0">
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-0 divide-x divide-slate-200">
        {/* Left: criteria */}
        <div className="p-4 space-y-3">
          <div>
            <Label className="text-xs">Criteria (plain English)</Label>
            <p className="text-[10px] text-slate-400 mb-1 leading-relaxed">
              e.g. <em>Product Line = Commercial AND Product Type is Real Estate</em>
            </p>
            <Textarea
              rows={3}
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              onBlur={persist}
              placeholder="Product Line is Commercial AND Product Type is Real Estate"
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Formgen Syntax</Label>
            {formgen ? (
              <pre className="mt-1 rounded border border-slate-200 bg-slate-50 p-2 text-[10px] font-mono text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
                {formgen}
              </pre>
            ) : criteria.trim() ? (
              <div className="mt-1 rounded border border-dashed border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-600 italic">
                No valid condition detected. Use: <strong>Field is Value</strong> or <strong>Field = Value</strong> (e.g. <em>Product Line = Commercial</em>)
              </div>
            ) : (
              <div className="mt-1 rounded border border-dashed border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-400 italic">
                Enter criteria above to generate formgen syntax.
              </div>
            )}
          </div>
        </div>

        {/* Right: placeholder selector */}
        <div className="p-4 space-y-3">
          {/* Locked defaults */}
          {defaultPhs.length > 0 && (
            <div>
              <Label className="text-xs">Always included (default placeholders)</Label>
              <p className="text-[10px] text-slate-400 mb-1.5 leading-relaxed">
                These always generate and cannot have criteria. To assign one to a condition instead, remove it from <strong>Default Docman Placeholders</strong> above first.
              </p>
              <ul className="space-y-1">
                {defaultPhs.map((p) => (
                  <li key={p._id} className="flex items-center gap-2 rounded px-2 py-1.5 bg-slate-50 border border-slate-200 opacity-60 cursor-not-allowed">
                    <input type="checkbox" checked disabled className="rounded border-slate-300" />
                    <span className="text-sm text-slate-500 line-through-none">{p.name}</span>
                    <span className="ml-auto text-[10px] text-slate-400">default</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Optional placeholders */}
          <div>
            <Label className="text-xs">
              {defaultPhs.length > 0 ? "Additional placeholders" : "Placeholders to generate"}
            </Label>
            <p className="text-[10px] text-slate-400 mb-1.5">
              {defaultPhs.length > 0
                ? "Select additional placeholders to generate when this condition is met. A placeholder can belong to multiple groups."
                : "Select which placeholders generate when this condition is met. A placeholder can belong to multiple groups."}
            </p>
            {optionalPhs.length === 0 && levelPlaceholders.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No placeholders defined for this level yet — add them in Placeholder Builder.</p>
            ) : optionalPhs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">All placeholders for this level are set as defaults — remove them from Default Docman Placeholders to use them here.</p>
            ) : (
              <>
                <div className="flex justify-end mb-1">
                  <button
                    onClick={() => {
                      const allSelected = optionalPhs.every((p) => selectedIds.has(p._id));
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        for (const p of optionalPhs) {
                          if (allSelected) next.delete(p._id); else next.add(p._id);
                        }
                        return next;
                      });
                    }}
                    onBlur={persist}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    {optionalPhs.every((p) => selectedIds.has(p._id)) ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {optionalPhs.map((p) => (
                    <li key={p._id}>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p._id)}
                          onChange={() => togglePlaceholder(p._id)}
                          onBlur={persist}
                          className="rounded border-slate-300 text-[var(--color-blue)]"
                        />
                        <span className="text-sm text-slate-800 group-hover:text-slate-900">{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Level Panel ───────────────────────────────────────────────────────────────

function LevelPanel({
  level,
  placeholders,
  groups,
  cardId,
}: {
  level: DocmanLevel;
  placeholders: Placeholder[];
  groups: Group[];
  cardId: Id<"cards">;
}) {
  const updatePlaceholder = useMutation(api.docman.updatePlaceholder);
  const updateGroup = useMutation(api.docman.updateGroup);
  const createGroup = useMutation(api.docman.createGroup);
  const deleteGroup = useMutation(api.docman.deleteGroup);

  const levelPlaceholders = placeholders.filter((p) => p.level === level);
  const levelGroups = groups.filter((g) => g.level === level);
  const defaultPhs = levelPlaceholders.filter((p) => !!p.isDefault);
  const nonDefaultPhs = levelPlaceholders.filter((p) => !p.isDefault);
  const defaultPlaceholderIds = useMemo(
    () => new Set(defaultPhs.map((p) => p._id as string)),
    [defaultPhs.map((p) => p._id).join(",")], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [defaultSearch, setDefaultSearch] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Keep active tab in sync: if current selection is deleted, fall back to first
  const activeGroup = levelGroups.find((g) => g._id === activeGroupId) ?? levelGroups[0] ?? null;

  async function markDefault(p: Placeholder) {
    await updatePlaceholder({ id: p._id, isDefault: true });
    // Remove from any conditional group it belongs to
    for (const g of levelGroups) {
      if (g.placeholderIds.includes(p._id)) {
        await updateGroup({ id: g._id, placeholderIds: g.placeholderIds.filter((id) => id !== p._id) });
      }
    }
  }

  async function unmarkDefault(p: Placeholder) {
    await updatePlaceholder({ id: p._id, isDefault: false });
  }

  async function handleAddGroup() {
    const id = await createGroup({ cardId, level, name: "New condition" });
    setActiveGroupId(id);
  }

  async function handleDeleteGroup(g: Group) {
    if (!confirm(`Remove condition "${g.name}"?`)) return;
    await deleteGroup({ id: g._id });
    // Move to previous tab or null
    const idx = levelGroups.findIndex((x) => x._id === g._id);
    const next = levelGroups[idx - 1] ?? levelGroups[idx + 1] ?? null;
    setActiveGroupId(next?._id ?? null);
  }

  const colours = LEVEL_COLOURS[level];

  return (
    <div className="space-y-6">
      {/* Default Docman Placeholders */}
      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Default Docman Placeholders</h3>
          <span className="text-xs text-slate-400">Always generated — cannot be in a conditional group. A placeholder can only be default or conditional, not both.</span>
        </div>

        {levelPlaceholders.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
            No placeholders exist for this level yet — add them in <strong>Placeholder Builder</strong> first.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {/* Search + select all */}
            <div className="border-b border-slate-200 px-3 py-2 flex items-center gap-2">
              <Input
                value={defaultSearch}
                onChange={(e) => setDefaultSearch(e.target.value)}
                placeholder="Search placeholders…"
                className="h-7 text-xs flex-1"
              />
              <button
                onClick={async () => {
                  const visible = levelPlaceholders.filter((p) => !defaultSearch || p.name.toLowerCase().includes(defaultSearch.toLowerCase()));
                  const allChecked = visible.every((p) => p.isDefault);
                  for (const p of visible) {
                    if (allChecked) { if (p.isDefault) await unmarkDefault(p); }
                    else { if (!p.isDefault) await markDefault(p); }
                  }
                }}
                className="shrink-0 text-xs text-slate-500 hover:text-slate-800 whitespace-nowrap"
              >
                {levelPlaceholders
                  .filter((p) => !defaultSearch || p.name.toLowerCase().includes(defaultSearch.toLowerCase()))
                  .every((p) => p.isDefault)
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
            {/* Scrollable checkbox list */}
            <ul className="max-h-44 overflow-y-auto divide-y divide-slate-100">
              {levelPlaceholders
                .filter((p) => !defaultSearch || p.name.toLowerCase().includes(defaultSearch.toLowerCase()))
                .map((p) => {
                  const isDefault = !!p.isDefault;
                  return (
                    <li key={p._id}>
                      <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={isDefault}
                          onChange={() => isDefault ? unmarkDefault(p) : markDefault(p)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-800">{p.name}</span>
                        {p.category && (
                          <span className="ml-auto text-[10px] text-slate-400">{p.category}</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              {levelPlaceholders.filter((p) => !defaultSearch || p.name.toLowerCase().includes(defaultSearch.toLowerCase())).length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-400 italic">No matches.</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Conditional Groups — tabbed */}
      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Conditional Groups</h3>
          <span className="text-xs text-slate-400">Placeholders that generate only when the condition is met. Each placeholder can belong to one group only.</span>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-slate-200">
          {levelGroups.map((g) => {
            const isActive = activeGroup?._id === g._id;
            return (
              <button
                key={g._id}
                onClick={() => setActiveGroupId(g._id)}
                className={`border-b-2 px-4 py-2 text-xs font-medium transition-colors max-w-[160px] whitespace-normal text-left leading-snug ${
                  isActive
                    ? "border-slate-700 text-slate-900 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
                title={g.name}
              >
                {g.name}
              </button>
            );
          })}
          <button
            onClick={handleAddGroup}
            className="border-b-2 border-transparent px-3 py-2 text-xs text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors shrink-0"
          >
            + Add
          </button>
        </div>

        {/* Active group content */}
        {levelGroups.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
            No conditions yet — click <strong>+ Add</strong> to create one.
          </div>
        ) : activeGroup ? (
          <div className="mt-3">
            <ConditionalGroupEditor
              key={activeGroup._id}
              group={activeGroup}
              levelPlaceholders={levelPlaceholders}
              defaultPlaceholderIds={defaultPlaceholderIds}
              onDelete={() => handleDeleteGroup(activeGroup)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Main Tool ─────────────────────────────────────────────────────────────────

export function DocmanTool({
  projectId,
  cardId,
}: {
  projectId: Id<"projects">;
  cardId?: Id<"cards">;
}) {
  const project = useQuery(api.projects.get, { id: projectId });
  const raw = useQuery(
    api.docman.listForCard,
    cardId ? { cardId } : "skip",
  ) as { groups: Group[]; placeholders: Placeholder[] } | undefined;
  const bulkImport = useMutation(api.docman.bulkImport);

  const [activeLevel, setActiveLevel] = useState<DocmanLevel>(LEVELS[0]);
  const [placeholderBuilderOpen, setPlaceholderBuilderOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const groups = raw?.groups ?? [];
  const placeholders = raw?.placeholders ?? [];

  // All hooks must be called before any early returns
  const exportData: DocmanExport = useMemo(() => {
    const nameToPlaceholder = new Map(placeholders.map((p) => [p._id as string, p]));
    return {
      placeholders: placeholders.map((p) => ({
        name: p.name,
        level: p.level as DocmanLevel,
        category: p.category || undefined,
        isDefault: p.isDefault || undefined,
      })),
      groups: groups.map((g) => ({
        name: g.name,
        level: g.level as DocmanLevel,
        criteriaUserWritten: g.criteriaUserWritten,
        criteriaFormgen: g.criteriaFormgen,
        placeholderNames: g.placeholderIds
          .map((id) => nameToPlaceholder.get(id)?.name)
          .filter((n): n is string => !!n),
      })),
    };
  }, [placeholders, groups]);

  const defaultMeta: YamlMeta = useMemo(
    () => ({
      storyId: "DM-CONFIG-001",
      title: `Document Manager — ${project?.name ?? ""}`,
      featureArea: "document-manager",
    }),
    [project?.name],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildDocmanYaml(exportData, meta),
    [exportData],
  );

  if (!cardId) {
    return (
      <div className="p-8 text-sm text-slate-600">
        This page expects a <code>?cardId=…</code> query parameter — open it
        from a Document Manager card in the heatmap.
      </div>
    );
  }
  if (project === undefined || raw === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const colours = LEVEL_COLOURS[activeLevel];

  // ImportDialog<T> expects T[] — we wrap DocmanExport as a single-element array
  function parseImportFile(text: string, filename: string): DocmanExport[] | string {
    const result = filename.endsWith(".yaml") || filename.endsWith(".yml")
      ? parseDocmanYaml(text)
      : parseDocmanExcel(text);
    if (typeof result === "string") return result;
    return [result];
  }

  async function handleImportConfirm(records: DocmanExport[], mode: ImportMode) {
    const data = records[0];
    if (!data || !cardId) return;
    await bulkImport({ cardId, mode, placeholders: data.placeholders, groups: data.groups });
    toast.success(`Imported ${data.placeholders.length} placeholder${data.placeholders.length !== 1 ? "s" : ""} and ${data.groups.length} group${data.groups.length !== 1 ? "s" : ""}`);
  }

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Document Manager</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {placeholders.filter((p) => p.isDefault).length} default template{placeholders.filter((p) => p.isDefault).length !== 1 ? "s" : ""} ·{" "}
            {groups.length} conditional {groups.length === 1 ? "group" : "groups"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>Import</Button>
          <Button variant="outline" size="sm" onClick={() => downloadDocmanExcel(exportData)}>Export Excel</Button>
          <Button variant="outline" size="sm" onClick={() => setYamlOpen(true)}>Export YAML</Button>
          <Button variant="outline" onClick={() => setPlaceholderBuilderOpen(true)}>
            Placeholder Builder
          </Button>
        </div>
      </div>

      {/* Level tabs */}
      <div className="mb-5 flex gap-0 border-b border-slate-200">
        {LEVELS.map((level) => {
          const phCount = placeholders.filter((p) => p.level === level).length;
          const grpCount = groups.filter((g) => g.level === level).length;
          const isActive = activeLevel === level;
          return (
            <button
              key={level}
              onClick={() => setActiveLevel(level)}
              className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? `${LEVEL_COLOURS[level].tab} bg-white`
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {level}
              {(phCount > 0 || grpCount > 0) && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? LEVEL_COLOURS[level].badge : "bg-slate-100 text-slate-500"
                }`}>
                  {phCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Level content */}
      <div className="flex-1 overflow-auto">
        <LevelPanel
          key={activeLevel}
          level={activeLevel}
          placeholders={placeholders}
          groups={groups}
          cardId={cardId}
        />
      </div>

      <PlaceholderBuilderDialog
        open={placeholderBuilderOpen}
        onOpenChange={setPlaceholderBuilderOpen}
        placeholders={placeholders}
        cardId={cardId}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadDocmanYaml(exportData, meta)}
      />

      <ImportDialog<DocmanExport>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Document Manager"
        acceptFileTypes=".yaml,.yml,.csv"
        parseFile={parseImportFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(data, i) => (
          <div key={i} className="text-xs text-slate-700 py-0.5">
            {data.placeholders.length} placeholder{data.placeholders.length !== 1 ? "s" : ""},{" "}
            {data.groups.length} group{data.groups.length !== 1 ? "s" : ""}
          </div>
        )}
      />
    </div>
  );
}
