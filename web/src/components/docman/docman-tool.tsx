"use client";

import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Modifier } from "@dnd-kit/core";
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
import { ExportButton } from "@/components/ui/export-button";
import {
  buildDocmanYaml,
  downloadDocmanYaml,
  downloadDocmanExcel,
  parseDocmanYaml,
  parseDocmanExcel,
  type DocmanExport,
} from "@/lib/export-import";
import { toast } from "sonner";
import { translateCriteria } from "@/lib/formgen";

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


// ── Drag-and-drop sub-components ─────────────────────────────────────────────

function DroppableCategory({
  id,
  isSelected,
  isOver,
  onClick,
  children,
}: {
  id: string;
  isSelected: boolean;
  isOver: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <li
      ref={setNodeRef}
      onClick={onClick}
      className={`flex items-center justify-between rounded px-3 py-1.5 cursor-pointer text-sm transition-colors ${
        isOver
          ? "bg-blue-100 ring-2 ring-[var(--color-blue)] ring-inset"
          : isSelected
          ? "bg-slate-100 text-slate-900 font-medium"
          : "hover:bg-slate-50 text-slate-800"
      }`}
    >
      {children}
    </li>
  );
}

function DraggablePlaceholder({
  placeholder,
  usedPlaceholderNames,
  usedPlaceholderMap,
  onDelete,
  onEdit,
}: {
  placeholder: Placeholder;
  usedPlaceholderNames: Set<string>;
  usedPlaceholderMap: Map<string, string[]>;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: placeholder._id,
    data: { placeholder },
  });

  return (
    <li
      ref={setNodeRef}
      className={`group flex items-start gap-1 rounded px-2 py-1.5 text-sm text-slate-800 transition-opacity ${
        isDragging ? "opacity-30" : "hover:bg-slate-50"
      }`}
    >
      {/* Drag handle */}
      <span
        {...listeners}
        {...attributes}
        className="cursor-grab shrink-0 text-slate-300 hover:text-slate-500 px-0.5 touch-none"
        title="Drag to move to another category"
      >
        ⠿
      </span>
      <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 break-words">
        <span className="break-words">{placeholder.name}</span>
        {placeholder.fromChecklist && usedPlaceholderNames.has(placeholder.name) && (
          <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
            from Smart Checklist
          </span>
        )}
      </span>
      <div className="hidden group-hover:flex gap-1 shrink-0">
        {placeholder.fromChecklist ? (
          <span
            title="Added from Smart Checklist — edit it there"
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-300 cursor-not-allowed"
          >Edit</span>
        ) : (
          <button
            onClick={onEdit}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >Edit</button>
        )}
        {usedPlaceholderNames.has(placeholder.name) ? (
          <span
            title={`Used by: ${(usedPlaceholderMap.get(placeholder.name) ?? []).join(", ")} — remove from checklist first`}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-300 cursor-not-allowed"
          >✕</span>
        ) : (
          <button
            onClick={onDelete}
            className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50"
          >✕</button>
        )}
      </div>
    </li>
  );
}

// ── Placeholder Builder Dialog ────────────────────────────────────────────────

function PlaceholderBuilderDialog({
  open,
  onOpenChange,
  placeholders,
  cardId,
  usedPlaceholderNames,
  usedPlaceholderMap,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  placeholders: Placeholder[];
  cardId: Id<"cards">;
  usedPlaceholderNames: Set<string>;
  usedPlaceholderMap: Map<string, string[]>;
}) {
  const createPlaceholder = useMutation(api.docman.createPlaceholder);
  const updatePlaceholder = useMutation(api.docman.updatePlaceholder);
  const deletePlaceholder = useMutation(api.docman.deletePlaceholder);

  const [selectedLevel, setSelectedLevel] = useState<DocmanLevel>(LEVELS[0]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<Id<"docmanPlaceholders"> | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverCategory, setDragOverCategory] = useState<string | null | "__none__">(undefined as unknown as null);
  const [activeDragName, setActiveDragName] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const snapToPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
    if (draggingNodeRect && activatorEvent instanceof PointerEvent) {
      const offsetX = activatorEvent.clientX - draggingNodeRect.left;
      const offsetY = activatorEvent.clientY - draggingNodeRect.top;
      return { ...transform, x: transform.x + draggingNodeRect.width / 2 - offsetX, y: transform.y + draggingNodeRect.height / 2 - offsetY };
    }
    return transform;
  };

  const levelPlaceholders = placeholders.filter((p) => p.level === selectedLevel);

  function isNoCat(p: Placeholder) {
    return !p.category || p.category === "No category";
  }

  const categories = useMemo(() => {
    const fromPlaceholders = levelPlaceholders
      .map((p) => p.category)
      .filter((c): c is string => !!c && c !== "No category");
    const merged = new Set([...fromPlaceholders, ...localCategories]);
    return [...merged].sort();
  }, [levelPlaceholders.map((p) => p.category).join(","), localCategories.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectLevel(level: DocmanLevel) {
    setSelectedLevel(level);
    setSelectedCategory(null);
    setNewCategoryName("");
    setLocalCategories([]);
  }

  const filteredByCategory = selectedCategory
    ? levelPlaceholders.filter((p) => p.category === selectedCategory)
    : levelPlaceholders.filter(isNoCat);

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
    await updatePlaceholder({ id, name });
    setEditingId(null);
  }

  function catCount(cat: string | null) {
    return levelPlaceholders.filter((p) => (cat === null ? isNoCat(p) : p.category === cat)).length;
  }

  function handleDragStart({ active }: { active: { data: { current?: { placeholder?: Placeholder } } } }) {
    setActiveDragName(active.data.current?.placeholder?.name ?? null);
  }

  function handleDragOver({ over }: DragOverEvent) {
    setDragOverCategory(over ? (over.id === "__no_category__" ? null : String(over.id)) : undefined as unknown as null);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragName(null);
    setDragOverCategory(undefined as unknown as null);
    if (!over) return;
    const ph = (active.data.current as { placeholder: Placeholder }).placeholder;
    const targetCat = over.id === "__no_category__" ? undefined : String(over.id);
    const currentCat = ph.category === "No category" ? undefined : (ph.category ?? undefined);
    if (targetCat === currentCat) return;
    await updatePlaceholder({ id: ph._id, category: targetCat });
  }

  // Droppable for "No category" — needs its own component instance
  const NoCategoryDroppable = () => {
    const { setNodeRef: setNoCatRef, isOver: noCatIsOver } = useDroppable({ id: "__no_category__" });
    return (
      <li
        ref={setNoCatRef}
        onClick={() => setSelectedCategory(null)}
        className={`flex items-center justify-between rounded px-3 py-1.5 cursor-pointer text-sm transition-colors ${
          noCatIsOver
            ? "bg-blue-100 ring-2 ring-[var(--color-blue)] ring-inset"
            : selectedCategory === null
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
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-4xl">
        <DialogHeader>
          <DialogTitle>Placeholder Builder</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">Drag placeholders onto a category to move them.</p>

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-3 gap-0 divide-x divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
            {/* Col 1: Level */}
            <div className="flex flex-col">
              <div className="bg-blue-50 border-b border-slate-200 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Level</p>
              </div>
              <ul className="p-1.5 space-y-0.5">
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
                      <span>{level}</span>
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

            {/* Col 2: Category (droppable targets) */}
            <div className="flex flex-col">
              <div className={`border-b border-slate-200 px-3 py-2 ${LEVEL_COLOURS[selectedLevel].header}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide">Category</p>
              </div>
              <ul className="overflow-y-auto p-1.5 space-y-0.5" style={{ height: "calc(13 * 2rem)" }}>
                <NoCategoryDroppable />
                {categories.map((cat) => {
                  const isOver = dragOverCategory === cat;
                  return (
                    <DroppableCategory
                      key={cat}
                      id={cat}
                      isSelected={selectedCategory === cat}
                      isOver={isOver}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <span className="truncate">{cat}</span>
                      {catCount(cat) > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ml-1 shrink-0 ${
                          selectedCategory === cat ? LEVEL_COLOURS[selectedLevel].badge : "bg-slate-100 text-slate-500"
                        }`}>
                          {catCount(cat)}
                        </span>
                      )}
                    </DroppableCategory>
                  );
                })}
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

            {/* Col 3: Placeholders (draggable) */}
            <div className="flex flex-col">
              <div className={`border-b border-slate-200 px-3 py-2 ${LEVEL_COLOURS[selectedLevel].header}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide">
                  Placeholders{selectedCategory ? ` — ${selectedCategory}` : " — No category"}
                </p>
                <p className="text-[10px] opacity-70 mt-0.5">LLC_BI__ClosingChecklist__c.Name</p>
              </div>
              <ul className="overflow-y-auto p-1.5 space-y-0.5" style={{ height: "calc(13 * 2rem)" }}>
                {filteredByCategory.length === 0 && (
                  <li className="px-2 py-2 text-xs text-slate-400 italic">No placeholders yet.</li>
                )}
                {filteredByCategory.map((p) => (
                  editingId === p._id ? (
                    <li key={p._id} className="px-2 py-1.5">
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
                    </li>
                  ) : (
                    <DraggablePlaceholder
                      key={p._id}
                      placeholder={p}
                      usedPlaceholderNames={usedPlaceholderNames}
                      usedPlaceholderMap={usedPlaceholderMap}
                      onDelete={() => deletePlaceholder({ id: p._id })}
                      onEdit={() => { setEditingId(p._id); setEditName(p.name); }}
                    />
                  )
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

          {/* Floating drag ghost */}
          <DragOverlay modifiers={[snapToPointer]}>
            {activeDragName && (
              <div className="rounded bg-white shadow-lg border border-[var(--color-blue)] px-3 py-1.5 text-sm text-slate-800 font-medium pointer-events-none">
                {activeDragName}
              </div>
            )}
          </DragOverlay>
        </DndContext>

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
  isLocked,
}: {
  group: Group;
  levelPlaceholders: Placeholder[];
  defaultPlaceholderIds: Set<string>;
  allGroups?: Group[];
  onDelete: () => void;
  isLocked: boolean;
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
          disabled={isLocked}
          className="h-7 text-sm font-medium flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          placeholder="Group name…"
        />
        {!isLocked && (
          <button onClick={onDelete} className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 shrink-0">
            Remove
          </button>
        )}
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
              disabled={isLocked}
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
                {!isLocked && (
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
                )}
                <ul className="space-y-1.5">
                  {optionalPhs.map((p) => (
                    <li key={p._id}>
                      <label className={`flex items-center gap-2 group ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p._id)}
                          disabled={isLocked}
                          onChange={() => togglePlaceholder(p._id)}
                          onBlur={persist}
                          className="rounded border-slate-300 text-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-50"
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
  isLocked,
}: {
  level: DocmanLevel;
  placeholders: Placeholder[];
  groups: Group[];
  cardId: Id<"cards">;
  isLocked: boolean;
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
              {!isLocked && <button
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
              </button>}
            </div>
            {/* Scrollable checkbox list */}
            <ul className="max-h-44 overflow-y-auto divide-y divide-slate-100">
              {levelPlaceholders
                .filter((p) => !defaultSearch || p.name.toLowerCase().includes(defaultSearch.toLowerCase()))
                .map((p) => {
                  const isDefault = !!p.isDefault;
                  return (
                    <li key={p._id}>
                      <label className={`flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          checked={isDefault}
                          disabled={isLocked}
                          onChange={() => isDefault ? unmarkDefault(p) : markDefault(p)}
                          className="rounded border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
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
          {!isLocked && (
            <button
              onClick={handleAddGroup}
              className="border-b-2 border-transparent px-3 py-2 text-xs text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors shrink-0"
            >
              + Add
            </button>
          )}
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
              isLocked={isLocked}
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
  const checklistReqs = useQuery(api.checklist.listForProject, { projectId });
  const bulkImport = useMutation(api.docman.bulkImport);

  const [activeLevel, setActiveLevel] = useState<DocmanLevel>(LEVELS[0]);
  const [placeholderBuilderOpen, setPlaceholderBuilderOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "docman");

  const groups = raw?.groups ?? [];
  const placeholders = raw?.placeholders ?? [];

  // Map of placeholder name → checklist item names that reference it
  const usedPlaceholderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of checklistReqs ?? []) {
      if (!r.placeholderName) continue;
      if (!map.has(r.placeholderName)) map.set(r.placeholderName, []);
      map.get(r.placeholderName)!.push(r.name || "(unnamed)");
    }
    return map;
  }, [checklistReqs]);
  const usedPlaceholderNames = useMemo(() => new Set(usedPlaceholderMap.keys()), [usedPlaceholderMap]);

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
    <div className="pb-6">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
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
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={isLocked}>Import</Button>
          <ExportButton
            size="sm"
            onExcelClick={() => downloadDocmanExcel(exportData)}
            onYamlClick={() => setYamlOpen(true)}
          />
          <Button variant="outline" onClick={() => setPlaceholderBuilderOpen(true)} disabled={isLocked}>
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
          isLocked={isLocked}
        />
      </div>

      <PlaceholderBuilderDialog
        open={placeholderBuilderOpen}
        onOpenChange={setPlaceholderBuilderOpen}
        placeholders={placeholders}
        cardId={cardId}
        usedPlaceholderNames={usedPlaceholderNames}
        usedPlaceholderMap={usedPlaceholderMap}
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
    </div>
  );
}

// ── Document Manager Preview Playground ───────────────────────────────────────

const DEFAULT_LOAN_PLACEHOLDERS = [
  "Application Form",
  "Arrears Statement",
  "Board Minutes",
  "Broker Update",
  "Closing Statement",
  "Consent to Charge",
  "Corporate Guarantee",
  "Credit Agreement",
  "Direct Debit Mandate",
  "Facility Letter",
  "ID Verification",
  "Insurance Certificate",
  "Land Registry Search",
  "Legal Charge",
  "Loan Agreement",
  "Mortgage Deed",
  "Personal Guarantee",
  "Redemption Statement",
  "Solicitor Undertaking",
  "Valuation Report",
];

type PreviewDoc = {
  id: string;
  name: string;
  category: string;
};

const CATEGORY_OPTIONS = [
  "Application",
  "Approval",
  "Credit Update",
  "Legal",
  "Legal Document",
  "Post Completion",
];

export function DocmanPreviewPlayground() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [docs] = useState<PreviewDoc[]>(() =>
    DEFAULT_LOAN_PLACEHOLDERS.map((name, i) => ({
      id: String(i),
      name,
      category: CATEGORY_OPTIONS[i % CATEGORY_OPTIONS.length],
    })),
  );

  const filtered = docs.filter((d) => {
    const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || d.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalDocs = docs.length;
  const customerPortalCount = docs.length;
  const eSignatureCount = 0;

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of docs) map[d.category] = (map[d.category] ?? 0) + 1;
    return map;
  }, [docs]);

  return (
    <div className="max-w-5xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Shows Loan default document placeholders that are automatically generated.
        </span>
      </div>

      <div className="flex gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" style={{ height: "420px" }}>
        {/* Left sidebar */}
        <div className="w-48 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
              categoryFilter === null ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-700 hover:bg-white"
            }`}
          >
            <span className="min-w-[1.5rem] text-right text-xs font-bold text-slate-500">{totalDocs}</span>
            <span>All Documents</span>
          </button>
          <div className="mb-1 flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-500">
            <span className="min-w-[1.5rem] text-right text-xs font-bold">{customerPortalCount}</span>
            <span>Customer Portal</span>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-500">
            <span className="min-w-[1.5rem] text-right text-xs font-bold">{eSignatureCount}</span>
            <span>E-Signature</span>
          </div>

          <div className="mb-2 border-t border-slate-200 pt-3">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Filter by Categories
            </p>
            {CATEGORY_OPTIONS.map((cat) => (
              <label key={cat} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-white">
                <input
                  type="checkbox"
                  checked={categoryFilter === cat}
                  onChange={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  className="rounded border-slate-300"
                />
                <span className="flex-1">{cat}</span>
                <span className="text-slate-400">{categoryCounts[cat] ?? 0}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by document name or details."
                className="w-full rounded border border-slate-300 py-1.5 pl-8 pr-3 text-xs text-slate-700 focus:border-[var(--color-blue)] focus:outline-none"
              />
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_160px_32px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Name ↑</span>
            <span>Last Modified Date</span>
            <span />
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400 italic">No documents match your search.</div>
            ) : (
              filtered.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-[1fr_160px_32px] items-center gap-2 px-4 py-2.5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                    </svg>
                    <span className="text-sm text-slate-800">{doc.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">03/12/2025</span>
                  <button className="text-slate-300 hover:text-slate-500">›</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
