"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import {
  buildStagesYaml,
  downloadStagesYaml,
  downloadStagesExcel,
  downloadFeesYaml,
  downloadConditionsYaml,
  downloadPolicyExceptionsYaml,
  downloadCovenantsYaml,
  downloadCollateralYaml,
  downloadInvolvementTypesYaml,
  downloadChecklistYaml,
  downloadDocmanYaml,
  downloadConnectionsYaml,
  downloadRelationshipsYaml,
  downloadAllConfigExcel,
  parseStagesFile,
  type StageImportRow,
  type FeeRecord,
  type ConditionRecord,
  type PolicyExceptionRecord,
  type CovenantPicklists,
  type CollateralPicklists,
  type CollateralFieldConfig,
  type InvolvementTypeRecord,
  type ChecklistRecord,
  type DocmanExport,
  type ConnectionRoleRecord,
  type RelationshipFieldConfig,
} from "@/lib/export-import";
import { EntityInvolvementPlayground, ManageInvolvementTypesDialog } from "@/components/entity-involvement/entity-involvement-tool";
import { CollateralPreviewPlayground } from "@/components/collateral/collateral-tool";
import { CovenantsPreviewPlayground } from "@/components/covenants/covenants-tool";
import { ConditionsPreviewPlayground } from "@/components/conditions/conditions-tool";
import { FeesPreviewPlayground } from "@/components/fees/fees-tool";
import { PolicyExceptionsPreviewPlayground } from "@/components/policy-exceptions/policy-exceptions-tool";
import { DocmanPreviewPlayground } from "@/components/docman/docman-tool";
import { ChecklistPreviewPlayground } from "@/components/checklist/checklist-tool";
import { PlaygroundStateProvider } from "@/components/stages/playground-state-context";
import { COLLATERAL_TYPE_SUBTYPE_MAP, COLLATERAL_SUBTYPE_KEY_PREFIX, COVENANT_CATEGORY_TYPE_MAP, COV_TYPE_KEY_PREFIX } from "@/lib/picklist-defaults";

const ALL_TABS = ["Details", "Document Generation", "Document Manager", "Smart Checklist", "Chatter", "Approval"] as const;

// Section name → builder route suffix (relative to /projects/[projectId]/)
const SECTION_BUILDER: Record<string, { label: string; path: string }> = {
  "Security":             { label: "Collateral Management Builder",  path: "collateral" },
  "Covenants":            { label: "Covenant Type Builder",          path: "covenants" },
  "Conditions":           { label: "Conditions Builder",             path: "conditions" },
  "Fees":                 { label: "Fees Builder",                   path: "fees" },
  "Policy Exceptions":    { label: "Policy Exceptions Builder",      path: "policy-exceptions" },
  "Borrowing Structure":  { label: "Entity Involvement Type Builder", path: "relationships/entity-involvement" },
};

// Tab name → builder route suffix
const TAB_BUILDER: Record<string, { label: string; path: string }> = {
  "Smart Checklist":  { label: "Smart Checklist Builder",    path: "checklist" },
  "Document Manager": { label: "Document Manager Builder",   path: "docman" },
};
const OPTIONAL_TABS = ["Chatter", "Approval"] as const;
const DEFAULT_TABS = ALL_TABS.filter((t) => !OPTIONAL_TABS.includes(t as typeof OPTIONAL_TABS[number]));

type TabName = typeof ALL_TABS[number];

function SortableStageItem({
  stage,
  isSelected,
  isEditing,
  editName,
  isDragging,
  isLocked,
  onSelect,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}: {
  stage: Doc<"stages">;
  isSelected: boolean;
  isEditing: boolean;
  editName: string;
  isDragging: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: stage._id,
    disabled: !!stage.isFixed || isLocked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button
        onClick={onSelect}
        className={`group relative flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          isSelected ? "bg-[var(--color-blue)] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        {/* Drag handle — only for non-fixed stages */}
        {!stage.isFixed && !isLocked && (
          <span
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            className="hidden cursor-grab active:cursor-grabbing touch-none group-hover:inline-flex items-center opacity-40 hover:opacity-80 -ml-1 mr-0.5"
            title="Drag to reorder"
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
              <circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/>
              <circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/>
            </svg>
          </span>
        )}

        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onCommitEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            onBlur={onCommitEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-32 rounded border border-white/50 bg-white/20 px-1 text-sm text-white placeholder:text-white/60 focus:outline-none"
          />
        ) : (
          <span>{stage.name}</span>
        )}

        {/* Rename / delete on hover */}
        {!isEditing && !stage.isFixed && (
          <span className="ml-1 hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
            <span
              onClick={onStartEdit}
              className="cursor-pointer rounded px-0.5 text-xs opacity-70 hover:opacity-100"
              title="Rename"
            >✎</span>
            <span
              onClick={onDelete}
              className="cursor-pointer rounded px-0.5 text-xs text-red-300 hover:text-red-100"
              title="Delete"
            >×</span>
          </span>
        )}
      </button>
    </div>
  );
}

export function StagesTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const data = useQuery(api.stages.listForProject, { projectId });
  const seedDefaults = useMutation(api.stages.seedDefaults);
  const createStage = useMutation(api.stages.createStage);
  const updateStage = useMutation(api.stages.updateStage);
  const deleteStage = useMutation(api.stages.deleteStage);
  const reorderStages = useMutation(api.stages.reorderStages);
  const createSection = useMutation(api.stages.createSection);
  const updateSection = useMutation(api.stages.updateSection);
  const deleteSection = useMutation(api.stages.deleteSection);
  const reorderSections = useMutation(api.stages.reorderSections);
  const bulkImport = useMutation(api.stages.bulkImport);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "stages");

  const [selectedStageId, setSelectedStageId] = useState<Id<"stages"> | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("Details");
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState<Id<"stages"> | null>(null);
  const [editStageName, setEditStageName] = useState("");
  const [draggingStageId, setDraggingStageId] = useState<Id<"stages"> | null>(null);
  const [addingSectionForStage, setAddingSectionForStage] = useState<Id<"stages"> | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<Id<"stageSections"> | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const addStageInputRef = useRef<HTMLInputElement>(null);
  const addSectionInputRef = useRef<HTMLInputElement>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Data for "All Configuration" export
  const allFees = useQuery(api.fees.listForProject, { projectId });
  const allConditions = useQuery(api.conditions.listForProject, { projectId });
  const allPolicyExceptions = useQuery(api.policyExceptions.listForProject, { projectId });
  const allCovenantsPicklists = useQuery(api.picklists.listForScope, { scope: "covenants" });
  const allCollateralPicklists = useQuery(api.picklists.listForScope, { scope: "collateral" });
  const allCollateralFieldConfigs = useQuery(api.collateral.listFieldConfigs, { projectId });
  const allInvolvementTypes = useQuery(api.involvementTypes.list, { projectId });
  const allProductHierarchy = useQuery(api.productHierarchy.listForProject, { projectId });
  const allChecklistReqs = useQuery(api.checklist.listForProject, { projectId });
  const allChecklistPicklists = useQuery(api.picklists.listForScope, { scope: "checklist" });
  const allDocmanData = useQuery(api.docman.listForProject, { projectId });
  const allDocmanPlaceholders = useQuery(api.docman.listPlaceholdersForProject, { projectId });
  const allConnections = useQuery(api.connections.list, { projectId });
  const allRelationshipsPicklists = useQuery(api.picklists.listForScope, { scope: "relationships" });
  const allRelationshipFieldConfigs = useQuery(api.relationships.listFieldConfigs, { projectId });

  // Seed default stages/sections on first load (mutation is idempotent)
  useEffect(() => {
    if (data) {
      seedDefaults({ projectId });
    }
  }, [data, projectId, seedDefaults]);

  // Auto-select first stage
  useEffect(() => {
    if (!data) return;
    if (!selectedStageId && data.stages.length > 0) {
      setSelectedStageId(data.stages[0]._id);
    }
    if (selectedStageId && !data.stages.find((s) => s._id === selectedStageId)) {
      setSelectedStageId(data.stages[0]?._id ?? null);
    }
  }, [data, selectedStageId]);

  useEffect(() => {
    if (addingStage) addStageInputRef.current?.focus();
  }, [addingStage]);

  useEffect(() => {
    if (addingSectionForStage) addSectionInputRef.current?.focus();
  }, [addingSectionForStage]);

  if (project === undefined || data === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const { stages, sections } = data;
  const selectedStage = stages.find((s) => s._id === selectedStageId) ?? null;
  const stageSections = selectedStage
    ? sections.filter((s) => s.stageId === selectedStage._id)
    : [];

  async function handleAddStage() {
    const name = newStageName.trim();
    if (!name) return;
    if (stages.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`A stage named "${name}" already exists.`);
      return;
    }
    const id = await createStage({ projectId, name });
    setNewStageName("");
    setAddingStage(false);
    if (id) setSelectedStageId(id as Id<"stages">);
    toast.success(`Stage "${name}" added`);
  }

  async function handleRenameStage() {
    if (!editingStageId) return;
    const name = editStageName.trim();
    if (!name) { setEditingStageId(null); return; }
    if (stages.some((s) => s._id !== editingStageId && s.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`A stage named "${name}" already exists.`);
      return;
    }
    await updateStage({ id: editingStageId, name });
    setEditingStageId(null);
    toast.success("Stage renamed");
  }

  async function handleDeleteStage(stage: Doc<"stages">) {
    if (stage.isFixed) return;
    if (!confirm(`Delete stage "${stage.name}" and all its sections?`)) return;
    await deleteStage({ id: stage._id });
    toast.success("Stage deleted");
  }

  async function handleMoveStage(stage: Doc<"stages">, dir: -1 | 1) {
    const idx = stages.findIndex((s) => s._id === stage._id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= stages.length) return;
    // Prevent moving a non-fixed stage into the fixed zone or a fixed stage at all
    const target = stages[newIdx];
    if (target.isFixed && !stage.isFixed) return;
    const newOrder = [...stages];
    newOrder.splice(idx, 1);
    newOrder.splice(newIdx, 0, stage);
    await reorderStages({ projectId, ids: newOrder.map((s) => s._id) });
  }

  async function handleAddSection() {
    if (!addingSectionForStage) return;
    const name = newSectionName.trim();
    if (!name) return;
    await createSection({ stageId: addingSectionForStage, projectId, name });
    setNewSectionName("");
    setAddingSectionForStage(null);
    toast.success(`Section "${name}" added`);
  }

  async function handleRenameSection() {
    if (!editingSectionId) return;
    const name = editSectionName.trim();
    if (!name) { setEditingSectionId(null); return; }
    await updateSection({ id: editingSectionId, name });
    setEditingSectionId(null);
    toast.success("Section renamed");
  }

  async function handleDeleteSection(id: Id<"stageSections">) {
    if (!confirm("Delete this section?")) return;
    await deleteSection({ id });
    toast.success("Section deleted");
  }

  async function handleToggleSectionHidden(section: Doc<"stageSections">) {
    await updateSection({ id: section._id, isHidden: !section.isHidden });
    toast.success(section.isHidden ? "Section shown" : "Section hidden");
  }

  async function handleMoveSection(section: Doc<"stageSections">, dir: -1 | 1) {
    const idx = stageSections.findIndex((s) => s._id === section._id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= stageSections.length) return;
    const newOrder = [...stageSections];
    newOrder.splice(idx, 1);
    newOrder.splice(newIdx, 0, section);
    await reorderSections({ stageId: section.stageId, ids: newOrder.map((s) => s._id) });
  }

  function hasFieldErrors(): boolean {
    for (const sec of sections) {
      const subs = (sec.subsections as Subsection[] | undefined) ?? [];
      for (const sub of subs) {
        for (const f of [...sub.fields, ...sub.sections.flatMap((s) => s.fields)]) {
          const cfg = NUMERIC_CONFIG[f.fieldType];
          if (!cfg) continue;
          const len = f.length ?? cfg[1];
          const dp = f.decimalPlaces ?? cfg[2];
          if (len + dp > cfg[0] || dp > cfg[3]) return true;
        }
      }
    }
    return false;
  }

  function buildExportData() {
    return {
      stages: stages.map((stage) => ({
        name: stage.name,
        isFixed: stage.isFixed,
        keyFields: stage.keyFields,
        guidanceForSuccess: stage.guidanceForSuccess,
        enabledTabs: stage.enabledTabs,
        sections: sections
          .filter((s) => s.stageId === stage._id)
          .map((s) => ({
            name: s.name,
            isDefault: s.isDefault,
            isHidden: s.isHidden,
            description: s.description,
            subsections: (s.subsections as Subsection[] | undefined)?.map((sub) => ({
              id: sub.id,
              name: sub.name,
              description: sub.description,
              fields: sub.fields,
              sections: sub.sections,
            })),
          })),
      })),
    };
  }

  const defaultMeta: YamlMeta = {
    storyId: "",
    title: `Stages — ${project?.name ?? ""}`,
    featureArea: "Stages",
  };

  async function handleImportConfirm(rows: StageImportRow[], mode: ImportMode) {
    await bulkImport({ projectId, rows, mode });
    toast.success(`Imported ${rows.length} route${rows.length !== 1 ? "s" : ""}`);
  }

  return (
    <PlaygroundStateProvider>
    <div className="flex h-full flex-col">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      {/* Stage path bar */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Stages — {project.name}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>Import</Button>
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>Export</Button>
            <Button
              size="sm"
              onClick={() => { setAddingStage(true); setNewStageName(""); }}
              disabled={isLocked}
              className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
            >
              + Add Stage
            </Button>
          </div>
        </div>

        {/* Stage pipeline */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setDraggingStageId(e.active.id as Id<"stages">)}
          onDragEnd={async (e) => {
            setDraggingStageId(null);
            const { active, over } = e;
            if (!over || active.id === over.id) return;
            const oldIdx = stages.findIndex((s) => s._id === active.id);
            const newIdx = stages.findIndex((s) => s._id === over.id);
            if (oldIdx === -1 || newIdx === -1) return;
            // Prevent non-fixed stages from swapping into fixed positions and vice-versa
            const movingStage = stages[oldIdx];
            const targetStage = stages[newIdx];
            if (movingStage.isFixed || targetStage.isFixed) return;
            const reordered = arrayMove(stages, oldIdx, newIdx);
            await reorderStages({ projectId, ids: reordered.map((s) => s._id) });
          }}
          onDragCancel={() => setDraggingStageId(null)}
        >
          <SortableContext items={stages.map((s) => s._id)} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap items-center gap-1">
              {stages.map((stage, idx) => (
                <div key={stage._id} className="flex items-center">
                  <SortableStageItem
                    stage={stage}
                    isSelected={selectedStageId === stage._id}
                    isEditing={editingStageId === stage._id}
                    editName={editStageName}
                    isDragging={draggingStageId === stage._id}
                    isLocked={isLocked}
                    onSelect={() => setSelectedStageId(stage._id)}
                    onStartEdit={() => { setEditingStageId(stage._id); setEditStageName(stage.name); }}
                    onEditChange={setEditStageName}
                    onCommitEdit={handleRenameStage}
                    onCancelEdit={() => setEditingStageId(null)}
                    onDelete={() => handleDeleteStage(stage)}
                  />
                  {idx < stages.length - 1 && (
                    <span className="mx-0.5 text-slate-300">›</span>
                  )}
                </div>
              ))}

              {/* Inline add stage input */}
              {addingStage && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-300">›</span>
                  <Input
                    ref={addStageInputRef}
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddStage();
                      if (e.key === "Escape") setAddingStage(false);
                    }}
                    placeholder="Stage name…"
                    className="h-8 w-40 text-sm"
                  />
                  <Button size="sm" onClick={handleAddStage} disabled={!newStageName.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingStage(false)}>Cancel</Button>
                </div>
              )}
            </div>
          </SortableContext>

          <DragOverlay>
            {draggingStageId ? (() => {
              const s = stages.find((s) => s._id === draggingStageId);
              return s ? (
                <div className="flex items-center gap-1.5 rounded bg-[var(--color-blue)] px-3 py-1.5 text-sm font-medium text-white shadow-lg opacity-90">
                  <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" className="opacity-60">
                    <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                    <circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/>
                    <circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/>
                  </svg>
                  {s.name}
                </div>
              ) : null;
            })() : null}
          </DragOverlay>
        </DndContext>

        {selectedStage?.isFixed && (
          <p className="mt-2 text-xs text-slate-400">
            <span className="font-medium text-slate-500">{selectedStage.name}</span> is a fixed stage — it cannot be renamed or removed.
          </p>
        )}
      </div>

      {/* Key Fields & Guidance for Success panel */}
      {selectedStage && (
        <KeyFieldsGuidancePanel
          stage={selectedStage}
          isLocked={isLocked}
          onSave={(keyFields, guidanceForSuccess) =>
            updateStage({ id: selectedStage._id, keyFields, guidanceForSuccess })
          }
        />
      )}

      {/* Bottom panel — tabs + content */}
      {selectedStage ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar + optional tab toggles */}
          <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-0">
                {ALL_TABS.filter((tab) => {
                  if (!OPTIONAL_TABS.includes(tab as typeof OPTIONAL_TABS[number])) return true;
                  const enabled = selectedStage.enabledTabs ?? ALL_TABS.slice();
                  return enabled.includes(tab);
                }).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as TabName)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "border-b-2 border-[var(--color-blue)] text-[var(--color-blue)]"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {/* Optional tab toggles */}
              <div className="flex items-center gap-3 py-2">
                <span className="text-xs text-slate-400">Optional:</span>
                {OPTIONAL_TABS.map((tab) => {
                  const enabledTabs = selectedStage.enabledTabs ?? [...ALL_TABS];
                  const isOn = enabledTabs.includes(tab);
                  return (
                    <button
                      key={tab}
                      onClick={async () => {
                        const current = selectedStage.enabledTabs ?? [...ALL_TABS];
                        const next = isOn
                          ? current.filter((t) => t !== tab)
                          : [...current, tab];
                        // If removing the active tab, reset to Details
                        if (isOn && activeTab === tab) setActiveTab("Details");
                        await updateStage({ id: selectedStage._id, enabledTabs: next });
                        toast.success(`${tab} tab ${isOn ? "hidden" : "shown"}`);
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        isOn
                          ? "bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600"
                          : "bg-slate-100 text-slate-400 line-through hover:bg-green-50 hover:text-green-700"
                      }`}
                      title={isOn ? `Click to hide ${tab} tab` : `Click to show ${tab} tab`}
                    >
                      {tab} · {isOn ? "Shown" : "Hidden"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tab content */}
          <div className={`flex-1 overflow-hidden ${activeTab !== "Details" ? "overflow-auto p-6" : ""}`}>
            {activeTab === "Details" ? (
              <DetailsTab
                projectId={projectId}
                stage={selectedStage}
                sections={stageSections}
                addingSectionForStage={addingSectionForStage}
                newSectionName={newSectionName}
                editingSectionId={editingSectionId}
                editSectionName={editSectionName}
                addSectionInputRef={addSectionInputRef}
                onAddSection={() => setAddingSectionForStage(selectedStage._id)}
                onNewSectionNameChange={setNewSectionName}
                onConfirmAddSection={handleAddSection}
                onCancelAddSection={() => { setAddingSectionForStage(null); setNewSectionName(""); }}
                onStartEditSection={(s) => { setEditingSectionId(s._id); setEditSectionName(s.name); }}
                onEditSectionNameChange={setEditSectionName}
                onConfirmEditSection={handleRenameSection}
                onCancelEditSection={() => setEditingSectionId(null)}
                onDeleteSection={handleDeleteSection}
                onToggleSectionHidden={handleToggleSectionHidden}
                onReorderSections={async (ids) => { await reorderSections({ stageId: selectedStage._id, ids }); }}
                onSaveSection={(id, patch) => updateSection({ id, ...patch })}
              />
            ) : activeTab === "Document Manager" ? (
              <div className="space-y-4">
                <div className="text-xs text-slate-500">
                  Configure placeholders in the{" "}
                  <Link
                    href={`/projects/${projectId}/${TAB_BUILDER["Document Manager"].path}`}
                    className="font-medium text-[var(--color-blue)] hover:underline"
                  >
                    Document Manager Builder →
                  </Link>
                </div>
                <DocmanPreviewPlayground />
              </div>
            ) : activeTab === "Smart Checklist" ? (
              <div className="space-y-4">
                <div className="text-xs text-slate-500">
                  Configure requirements in the{" "}
                  <Link
                    href={`/projects/${projectId}/${TAB_BUILDER["Smart Checklist"].path}`}
                    className="font-medium text-[var(--color-blue)] hover:underline"
                  >
                    Smart Checklist Builder →
                  </Link>
                </div>
                <ChecklistPreviewPlayground projectId={projectId} />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                {TAB_BUILDER[activeTab] ? (
                  <>
                    <p className="mb-3">
                      Configure this tab in the{" "}
                      <Link
                        href={`/projects/${projectId}/${TAB_BUILDER[activeTab].path}`}
                        className="font-medium text-[var(--color-blue)] hover:underline"
                      >
                        {TAB_BUILDER[activeTab].label} →
                      </Link>
                    </p>
                  </>
                ) : activeTab === "Document Generation" ? (
                  "Please contact nCino team for document generation."
                ) : (
                  `${activeTab} configuration coming soon.`
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Select a stage to configure it.
        </div>
      )}

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={(meta) => buildStagesYaml(buildExportData(), meta)}
        onDownload={(meta) => downloadStagesYaml(buildExportData(), meta)}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectName={project.name}
        hasFieldErrors={hasFieldErrors()}
        onExport={(scope, format) => {
          const stageMeta = {
            storyId: "",
            title: `Stages — ${project.name}`,
            featureArea: "Stages",
          };
          if (scope === "ui") {
            if (format === "yaml") {
              setExportOpen(false);
              downloadStagesYaml(buildExportData(), stageMeta);
            } else {
              setExportOpen(false);
              downloadStagesExcel(buildExportData());
            }
          } else {
            const fees: FeeRecord[] = (allFees ?? []).map((f) => ({
              name: f.name,
              feePaidBy: f.feePaidBy,
              calculationType: f.calculationType as FeeRecord["calculationType"],
              basisSource: f.basisSource,
              percentage: f.percentage,
              amount: f.amount,
              collectionMethod: f.collectionMethod,
              autoApply: f.autoApply,
              appliedToProducts: f.appliedToProducts,
              notes: f.notes,
            }));
            const conditions: ConditionRecord[] = (allConditions ?? []).map((c) => ({
              name: c.name,
              conditionType: c.conditionType as ConditionRecord["conditionType"],
              category: c.category,
              assignedParty: c.assignedParty,
              description: c.description,
              legalDescription: c.legalDescription,
            }));
            const exceptions: PolicyExceptionRecord[] = (allPolicyExceptions ?? []).map((e) => ({
              type: e.type,
              name: e.name,
              severities: (e.severities ?? []) as string[],
              mitigationReasons: (e.mitigationReasons ?? []) as PolicyExceptionRecord["mitigationReasons"],
            }));
            // Build covenants picklists
            const covCategories = allCovenantsPicklists?.find((p) => p.key === "category")?.values ?? [];
            const covFrequencies = allCovenantsPicklists?.find((p) => p.key === "frequency")?.values ?? [];
            const covTypesByCategory: Record<string, string[]> = {};
            for (const cat of covCategories) {
              const stored = allCovenantsPicklists?.find((p) => p.key === `${COV_TYPE_KEY_PREFIX}${cat}`);
              covTypesByCategory[cat] = stored?.values ?? COVENANT_CATEGORY_TYPE_MAP[cat] ?? [];
            }
            const covenants: CovenantPicklists = { categories: covCategories, covenantTypesByCategory: covTypesByCategory, frequencies: covFrequencies };

            // Build collateral picklists
            const collateralTypes = allCollateralPicklists?.find((r) => r.key === "types")?.values ?? Object.keys(COLLATERAL_TYPE_SUBTYPE_MAP);
            const subtypesByType: Record<string, string[]> = {};
            for (const type of collateralTypes) {
              const row = allCollateralPicklists?.find((r) => r.key === COLLATERAL_SUBTYPE_KEY_PREFIX + type);
              subtypesByType[type] = row?.values ?? COLLATERAL_TYPE_SUBTYPE_MAP[type] ?? [];
            }
            const collateral: CollateralPicklists = { types: collateralTypes, subtypesByType };
            const collateralFieldConfigs: CollateralFieldConfig[] = (allCollateralFieldConfigs ?? []) as CollateralFieldConfig[];

            // Build involvement types
            const involvementTypes: InvolvementTypeRecord[] = (allInvolvementTypes ?? []).map((r) => ({ name: r.name }));

            // Build product hierarchy
            const phData = allProductHierarchy;
            const lineMap = new Map((phData?.lines ?? []).map((l) => [l._id, l]));
            const typeMap = new Map((phData?.types ?? []).map((t) => [t._id, t]));
            const productHierarchy = {
              lines: (phData?.lines ?? []).map((l) => ({ name: l.name, productObject: l.productObject })),
              types: (phData?.types ?? []).map((t) => ({ name: t.name, productLineName: lineMap.get(t.productLineId)?.name ?? "", usageType: t.usageType })),
              products: (phData?.products ?? []).map((p) => ({ name: p.name, productLineName: lineMap.get(p.productLineId)?.name ?? "", productTypeName: typeMap.get(p.productTypeId)?.name ?? "", productCode: p.productCode })),
            };

            // Build checklist
            const checklist: ChecklistRecord[] = (allChecklistReqs ?? []).map((r) => ({
              name: r.name,
              checklistLevel: r.checklistLevel as ChecklistRecord["checklistLevel"],
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
            }));
            const checklistPicklists = new Map<string, string[]>();
            for (const row of allChecklistPicklists ?? []) {
              checklistPicklists.set(row.key, row.values);
            }

            // Build docman
            const phIdToName = new Map((allDocmanPlaceholders ?? []).map((p) => [p._id, p.name]));
            const docman: DocmanExport = {
              placeholders: (allDocmanData?.placeholders ?? []).map((p) => ({
                name: p.name,
                level: p.level as DocmanExport["placeholders"][number]["level"],
                category: p.category,
                isDefault: p.isDefault,
              })),
              groups: (allDocmanData?.groups ?? []).map((g) => ({
                name: g.name,
                level: g.level as DocmanExport["groups"][number]["level"],
                criteriaUserWritten: g.criteriaUserWritten,
                criteriaFormgen: g.criteriaFormgen,
                placeholderNames: g.placeholderIds.map((id) => phIdToName.get(id) ?? id).filter(Boolean),
              })),
            };

            // Build connections
            const connections: ConnectionRoleRecord[] = (allConnections ?? []).map((r) => ({
              name: r.name,
              fromType: r.fromType,
              toType: r.toType,
              description: r.description,
              selfReciprocating: r.selfReciprocating,
              reciprocalRole: r.reciprocalRole,
            }));

            // Build relationships
            const SYSTEM_TYPES = ["Individual", "Business", "Household", "Lender", "Vendor"];
            const userRelTypes = allRelationshipsPicklists?.find((r) => r.key === "types")?.values ?? [];
            const hiddenRelTypes = allRelationshipsPicklists?.find((r) => r.key === "hidden-types")?.values ?? [];
            const allRelTypes = [...SYSTEM_TYPES, ...userRelTypes];
            const relFieldConfigs: RelationshipFieldConfig[] = (allRelationshipFieldConfigs ?? []).map((c) => ({
              relationshipType: c.relationshipType,
              sections: c.sections.map((s) => ({
                name: s.name,
                fields: s.fields.map((f) => ({ name: f.name, fieldType: f.fieldType, picklistValues: f.picklistValues })),
              })),
            }));

            setExportOpen(false);
            if (format === "yaml") {
              // YAML doesn't support multiple sheets — download one file per builder
              const allMeta = { storyId: "", title: `All Configuration — ${project.name}`, featureArea: "All" };
              downloadStagesYaml(buildExportData(), stageMeta);
              downloadFeesYaml(fees, { ...allMeta, title: `Fees — ${project.name}`, featureArea: "Fees" });
              downloadConditionsYaml(conditions, { ...allMeta, title: `Conditions — ${project.name}`, featureArea: "Conditions" });
              downloadPolicyExceptionsYaml(exceptions, { ...allMeta, title: `Policy Exceptions — ${project.name}`, featureArea: "Policy Exceptions" });
              downloadCovenantsYaml(covenants, { ...allMeta, title: `Covenant Types — ${project.name}`, featureArea: "Covenants" });
              downloadCollateralYaml(collateral, { ...allMeta, title: `Collateral Types — ${project.name}`, featureArea: "Collateral" });
              downloadInvolvementTypesYaml(involvementTypes, { ...allMeta, title: `Entity Involvement Types — ${project.name}`, featureArea: "Relationships" });
              downloadChecklistYaml(checklist, { ...allMeta, title: `Smart Checklist — ${project.name}`, featureArea: "SmartChecklist" }, checklistPicklists);
              downloadDocmanYaml(docman, { ...allMeta, title: `Document Manager — ${project.name}`, featureArea: "DocumentManager" });
              downloadConnectionsYaml(connections, { ...allMeta, title: `Connections — ${project.name}`, featureArea: "Connections" });
              downloadRelationshipsYaml(allRelTypes, { ...allMeta, title: `Relationships — ${project.name}`, featureArea: "Relationships" });
            } else {
              downloadAllConfigExcel({
                projectName: project.name,
                stages: buildExportData(),
                fees,
                conditions,
                policyExceptions: exceptions,
                covenants,
                collateral,
                collateralFieldConfigs,
                involvementTypes,
                productHierarchy,
                checklist,
                checklistPicklists,
                docman,
                connections,
                relationships: { types: allRelTypes, fieldConfigs: relFieldConfigs, hiddenTypes: hiddenRelTypes },
              });
            }
          }
        }}
      />

      <ImportDialog<StageImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Stages"
        acceptFileTypes=".csv,.xls,.xlsx,.yaml,.yml"
        parseFile={(text, filename) => parseStagesFile(text, filename)}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="truncate py-0.5 text-xs text-slate-700">
            <span className="font-medium">{r.stageName}</span> › {r.sectionName}
            {r.description && <span className="ml-1 text-slate-400">— {r.description.slice(0, 40)}</span>}
          </div>
        )}
      />
    </div>
    </PlaygroundStateProvider>
  );
}

// ── Key Fields & Guidance for Success Panel ───────────────────────────────────

function KeyFieldsGuidancePanel({
  stage,
  isLocked,
  onSave,
}: {
  stage: Doc<"stages">;
  isLocked: boolean;
  onSave: (keyFields: string[], guidanceForSuccess: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [keyFieldInputs, setKeyFieldInputs] = useState<string[]>([]);
  const [guidance, setGuidance] = useState("");

  useEffect(() => {
    setEditing(false);
  }, [stage._id]);

  function openEdit() {
    setKeyFieldInputs(
      stage.keyFields && stage.keyFields.length > 0
        ? [...stage.keyFields, ...Array(5 - stage.keyFields.length).fill("")]
        : ["", "", "", "", ""],
    );
    setGuidance(stage.guidanceForSuccess ?? "");
    setEditing(true);
  }

  async function handleSave() {
    const fields = keyFieldInputs.map((f) => f.trim()).filter(Boolean);
    await onSave(fields, guidance.trim());
    setEditing(false);
  }

  const hasContent = (stage.keyFields && stage.keyFields.length > 0) || stage.guidanceForSuccess;

  return (
    <div className="flex-shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-3">
      {editing ? (
        <div className="flex gap-8">
          {/* Key Fields editor */}
          <div className="w-72 shrink-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Fields (up to 5)</p>
            <div className="space-y-1.5">
              {keyFieldInputs.slice(0, 5).map((val, i) => (
                <Input
                  key={i}
                  value={val}
                  onChange={(e) => {
                    const next = [...keyFieldInputs];
                    next[i] = e.target.value;
                    setKeyFieldInputs(next);
                  }}
                  placeholder={`Field ${i + 1}`}
                  className="h-7 text-xs"
                />
              ))}
            </div>
          </div>

          {/* Guidance editor */}
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Guidance for Success</p>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder={"Enter guidance text (use new lines for bullet points)"}
              rows={6}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col justify-start gap-2 pt-6">
            <Button size="sm" onClick={handleSave} className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]">Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-8">
          {/* Key Fields display */}
          <div className="w-72 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Fields</p>
              {!isLocked && (
                <button
                  onClick={openEdit}
                  className="text-xs text-[var(--color-blue)] hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
            {stage.keyFields && stage.keyFields.length > 0 ? (
              <ul className="space-y-0.5">
                {stage.keyFields.map((f, i) => (
                  <li key={i} className="text-xs text-slate-700">• {f}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">No key fields configured.</p>
            )}
          </div>

          {/* Guidance display */}
          <div className="flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Guidance for Success</p>
            {stage.guidanceForSuccess ? (
              <ul className="space-y-0.5">
                {stage.guidanceForSuccess.split("\n").filter((l) => l.trim()).map((line, i) => (
                  <li key={i} className="text-xs text-slate-700">• {line.trim()}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">No guidance configured.</p>
            )}
          </div>

          {/* Edit button on the right if no content yet (cleaner empty state) */}
          {!hasContent && !isLocked && (
            <button
              onClick={openEdit}
              className="shrink-0 text-xs text-[var(--color-blue)] hover:underline"
            >
              + Add key fields &amp; guidance
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable Routes List ──────────────────────────────────────────────────────

function SortableRouteItem({
  section,
  isSelected,
  editingSectionId,
  editSectionName,
  onSelect,
  onEditSectionNameChange,
  onConfirmEditSection,
  onCancelEditSection,
  onStartEditSection,
  onToggleSectionHidden,
  onDeleteSection,
}: {
  section: Doc<"stageSections">;
  isSelected: boolean;
  editingSectionId: Id<"stageSections"> | null;
  editSectionName: string;
  onSelect: () => void;
  onEditSectionNameChange: (v: string) => void;
  onConfirmEditSection: () => void;
  onCancelEditSection: () => void;
  onStartEditSection: () => void;
  onToggleSectionHidden: () => void;
  onDeleteSection: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isEditing = editingSectionId === section._id;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 px-2 py-0.5 ${
        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
      } ${section.isHidden ? "opacity-50" : ""}`}
    >
      {/* Drag handle — always visible, clearly signifies draggability */}
      <span
        {...listeners}
        {...attributes}
        className="flex shrink-0 cursor-grab items-center text-slate-300 hover:text-slate-500 active:cursor-grabbing touch-none px-0.5"
        title="Drag to reorder"
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="3" cy="3" r="1.5"/>
          <circle cx="7" cy="3" r="1.5"/>
          <circle cx="3" cy="8" r="1.5"/>
          <circle cx="7" cy="8" r="1.5"/>
          <circle cx="3" cy="13" r="1.5"/>
          <circle cx="7" cy="13" r="1.5"/>
        </svg>
      </span>

      {/* Name / inline edit */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            autoFocus
            value={editSectionName}
            onChange={(e) => onEditSectionNameChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onConfirmEditSection();
              if (e.key === "Escape") onCancelEditSection();
            }}
            onBlur={onConfirmEditSection}
            className="h-6 text-xs"
          />
        ) : (
          <button
            onClick={onSelect}
            className={`w-full truncate py-1.5 text-left text-sm ${
              isSelected ? "font-medium text-slate-900" : "text-slate-700"
            } ${section.isHidden ? "line-through" : ""}`}
          >
            {section.name}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {!isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={onStartEditSection}
            className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            title="Rename"
          >✎</button>
          <button
            onClick={onToggleSectionHidden}
            className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            title={section.isHidden ? "Show section" : "Hide section"}
          >{section.isHidden ? "Show" : "Hide"}</button>
          {!section.isDefault && (
            <button
              onClick={onDeleteSection}
              className="rounded px-1 py-0.5 text-[10px] text-red-400 hover:bg-red-50 hover:text-red-600"
              title="Delete"
            >×</button>
          )}
        </div>
      )}
    </li>
  );
}

function SortableRoutesList({
  sections,
  selectedSectionId,
  editingSectionId,
  editSectionName,
  onSelect,
  onEditSectionNameChange,
  onConfirmEditSection,
  onCancelEditSection,
  onStartEditSection,
  onToggleSectionHidden,
  onDeleteSection,
  onReorderSections,
}: {
  sections: Doc<"stageSections">[];
  selectedSectionId: Id<"stageSections"> | null;
  editingSectionId: Id<"stageSections"> | null;
  editSectionName: string;
  onSelect: (id: Id<"stageSections">) => void;
  onEditSectionNameChange: (v: string) => void;
  onConfirmEditSection: () => void;
  onCancelEditSection: () => void;
  onStartEditSection: (s: Doc<"stageSections">) => void;
  onToggleSectionHidden: (s: Doc<"stageSections">) => void;
  onDeleteSection: (id: Id<"stageSections">) => void;
  onReorderSections: (ids: Id<"stageSections">[]) => Promise<void>;
}) {
  const [activeDragName, setActiveDragName] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart({ active }: DragStartEvent) {
    const s = sections.find((s) => s._id === active.id);
    setActiveDragName(s?.name ?? null);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragName(null);
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex((s) => s._id === active.id);
    const newIdx = sections.findIndex((s) => s._id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sections, oldIdx, newIdx);
    await onReorderSections(reordered.map((s) => s._id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sections.map((s) => s._id)} strategy={verticalListSortingStrategy}>
        <ul className="h-full overflow-y-auto py-1">
          {sections.map((section) => (
            <SortableRouteItem
              key={section._id}
              section={section}
              isSelected={selectedSectionId === section._id}
              editingSectionId={editingSectionId}
              editSectionName={editSectionName}
              onSelect={() => onSelect(section._id)}
              onEditSectionNameChange={onEditSectionNameChange}
              onConfirmEditSection={onConfirmEditSection}
              onCancelEditSection={onCancelEditSection}
              onStartEditSection={() => onStartEditSection(section)}
              onToggleSectionHidden={() => onToggleSectionHidden(section)}
              onDeleteSection={() => onDeleteSection(section._id)}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay>
        {activeDragName && (
          <div className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-[var(--color-blue)] ring-opacity-50">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="text-slate-400">
              <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
              <circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/>
              <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
            </svg>
            {activeDragName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── Details Tab ───────────────────────────────────────────────────────────────

function DetailsTab({
  projectId,
  stage,
  sections,
  addingSectionForStage,
  newSectionName,
  editingSectionId,
  editSectionName,
  addSectionInputRef,
  onAddSection,
  onNewSectionNameChange,
  onConfirmAddSection,
  onCancelAddSection,
  onStartEditSection,
  onEditSectionNameChange,
  onConfirmEditSection,
  onCancelEditSection,
  onDeleteSection,
  onToggleSectionHidden,
  onReorderSections,
  onSaveSection,
}: {
  projectId: Id<"projects">;
  stage: Doc<"stages">;
  sections: Doc<"stageSections">[];
  addingSectionForStage: Id<"stages"> | null;
  newSectionName: string;
  editingSectionId: Id<"stageSections"> | null;
  editSectionName: string;
  addSectionInputRef: React.RefObject<HTMLInputElement>;
  onAddSection: () => void;
  onNewSectionNameChange: (v: string) => void;
  onConfirmAddSection: () => void;
  onCancelAddSection: () => void;
  onStartEditSection: (s: Doc<"stageSections">) => void;
  onEditSectionNameChange: (v: string) => void;
  onConfirmEditSection: () => void;
  onCancelEditSection: () => void;
  onDeleteSection: (id: Id<"stageSections">) => void;
  onToggleSectionHidden: (s: Doc<"stageSections">) => void;
  onReorderSections: (ids: Id<"stageSections">[]) => Promise<void>;
  onSaveSection: (id: Id<"stageSections">, patch: Partial<Pick<Doc<"stageSections">, "description" | "subsections">>) => void;
}) {
  const [selectedSectionId, setSelectedSectionId] = useState<Id<"stageSections"> | null>(
    sections[0]?._id ?? null,
  );

  // Keep selection valid as sections change
  useEffect(() => {
    if (!selectedSectionId && sections.length > 0) {
      setSelectedSectionId(sections[0]._id);
    }
    if (selectedSectionId && !sections.find((s) => s._id === selectedSectionId)) {
      setSelectedSectionId(sections[0]?._id ?? null);
    }
  }, [sections, selectedSectionId]);

  const selectedSection = sections.find((s) => s._id === selectedSectionId) ?? null;

  return (
    <div className="flex h-full gap-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Left sidebar — section tabs */}
      <div className="flex h-full w-64 flex-shrink-0 flex-col border-r border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Routes</span>
          <button
            onClick={onAddSection}
            disabled={addingSectionForStage !== null}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-[var(--color-blue)] hover:bg-[var(--color-blue)]/10 disabled:opacity-40"
            title="Add route"
          >
            + Add
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <SortableRoutesList
            sections={sections}
            selectedSectionId={selectedSectionId}
            editingSectionId={editingSectionId}
            editSectionName={editSectionName}
            onSelect={setSelectedSectionId}
            onEditSectionNameChange={onEditSectionNameChange}
            onConfirmEditSection={onConfirmEditSection}
            onCancelEditSection={onCancelEditSection}
            onStartEditSection={(s) => { onStartEditSection(s); setSelectedSectionId(s._id); }}
            onToggleSectionHidden={onToggleSectionHidden}
            onDeleteSection={onDeleteSection}
            onReorderSections={onReorderSections}
          />
        </div>

        {/* Inline add row */}
        {addingSectionForStage === stage._id && (
          <div className="border-t border-slate-100 px-2 py-1.5">
            <Input
              ref={addSectionInputRef}
              value={newSectionName}
              onChange={(e) => onNewSectionNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirmAddSection();
                if (e.key === "Escape") onCancelAddSection();
              }}
              placeholder="Section name…"
              className="h-7 text-xs"
            />
            <div className="mt-1 flex gap-1">
              <Button size="sm" onClick={onConfirmAddSection} disabled={!newSectionName.trim()} className="h-6 text-xs px-2">Add</Button>
              <Button size="sm" variant="ghost" onClick={onCancelAddSection} className="h-6 text-xs px-2">Cancel</Button>
            </div>
          </div>
        )}

        {sections.length === 0 && addingSectionForStage !== stage._id && (
          <div className="px-3 py-4 text-center text-xs text-slate-400">
            No routes yet.<br />Click + Add to start.
          </div>
        )}
      </div>

      {/* Right panel — selected section */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedSection ? (
          <SectionPanel
            key={selectedSection._id}
            section={selectedSection}
            projectId={projectId}
            onSave={(patch) => onSaveSection(selectedSection._id, patch)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            Select a section from the left to view it.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section Panel (right panel content) ──────────────────────────────────────

type SubSection = { id: string; name: string; fields: Field[] };
type Subsection = { id: string; name: string; description?: string; fields: Field[]; sections: SubSection[] };
type Field = { id: string; name: string; fieldType: string; picklistValues?: string[]; length?: number; decimalPlaces?: number };

const FIELD_TYPES = ["Text", "Number", "Date", "Checkbox", "Picklist", "Lookup", "Currency", "Percentage", "TextArea"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function SectionPanel({
  section,
  projectId,
  onSave,
}: {
  section: Doc<"stageSections">;
  projectId: Id<"projects">;
  onSave: (patch: Partial<Pick<Doc<"stageSections">, "description" | "subsections">>) => void;
}) {
  const hidden = !!section.isHidden;
  const builderLink = SECTION_BUILDER[section.name];
  const isBorrowingStructure = section.name === "Borrowing Structure";
  const isSecurity = section.name === "Security";
  const isCovenants = section.name === "Covenants";
  const isConditions = section.name === "Conditions";
  const isFees = section.name === "Fees";
  const isPolicyExceptions = section.name === "Policy Exceptions";

  const involvementTypes = useQuery(
    api.involvementTypes.list,
    isBorrowingStructure ? { projectId } : "skip",
  );
  const typeNames = (involvementTypes ?? []).map((t) => t.name);
  const [manageInvolvementOpen, setManageInvolvementOpen] = useState(false);

  const collateralPicklists = useQuery(
    api.picklists.listForScope,
    isSecurity ? { scope: "collateral" } : "skip",
  );
  const collateralTypeValues = useMemo(() => {
    if (!isSecurity) return [];
    const row = collateralPicklists?.find((r) => r.key === "types");
    return row?.values ?? Object.keys(COLLATERAL_TYPE_SUBTYPE_MAP);
  }, [isSecurity, collateralPicklists]);
  function collateralSubtypesForType(type: string): string[] {
    const row = collateralPicklists?.find((r) => r.key === COLLATERAL_SUBTYPE_KEY_PREFIX + type);
    return row?.values ?? COLLATERAL_TYPE_SUBTYPE_MAP[type] ?? [];
  }

  const [subsections, setSubsections] = useState<Subsection[]>(
    (section.subsections as Subsection[] | undefined) ?? [],
  );

  function saveSubsections(next: Subsection[]) {
    setSubsections(next);
    onSave({ subsections: next });
  }

  function addSubsection() {
    saveSubsections([...subsections, { id: uid(), name: "New Sub Route", fields: [], sections: [] }]);
  }

  function updateSubsectionName(id: string, name: string) {
    saveSubsections(subsections.map((s) => s.id === id ? { ...s, name } : s));
  }

  function updateSubsectionDescription(id: string, description: string) {
    saveSubsections(subsections.map((s) => s.id === id ? { ...s, description } : s));
  }

  function deleteSubsection(id: string) {
    saveSubsections(subsections.filter((s) => s.id !== id));
  }

  // Top-level fields on sub route (kept for backwards compat but not surfaced in UI)
  function addField(subsectionId: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subsectionId
        ? { ...s, fields: [...s.fields, { id: uid(), name: "New field", fieldType: "Text" }] }
        : s
    ));
  }
  function updateField(subsectionId: string, fieldId: string, patch: Partial<Field>) {
    saveSubsections(subsections.map((s) =>
      s.id === subsectionId
        ? { ...s, fields: s.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) }
        : s
    ));
  }
  function deleteField(subsectionId: string, fieldId: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subsectionId
        ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
        : s
    ));
  }

  // Section CRUD within a sub route
  function addSection(subId: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: [...(s.sections ?? []), { id: uid(), name: "New Section", fields: [] }] }
        : s
    ));
  }
  function updateSectionName(subId: string, secId: string, name: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: (s.sections ?? []).map((sec) => sec.id === secId ? { ...sec, name } : sec) }
        : s
    ));
  }
  function deleteSection(subId: string, secId: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: (s.sections ?? []).filter((sec) => sec.id !== secId) }
        : s
    ));
  }

  // Field CRUD within a section within a sub route
  function addSectionField(subId: string, secId: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: (s.sections ?? []).map((sec) =>
            sec.id === secId
              ? { ...sec, fields: [...sec.fields, { id: uid(), name: "New field", fieldType: "Text" }] }
              : sec
          )}
        : s
    ));
  }
  function updateSectionField(subId: string, secId: string, fieldId: string, patch: Partial<Field>) {
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: (s.sections ?? []).map((sec) =>
            sec.id === secId
              ? { ...sec, fields: sec.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) }
              : sec
          )}
        : s
    ));
  }
  function deleteSectionField(subId: string, secId: string, fieldId: string) {
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: (s.sections ?? []).map((sec) =>
            sec.id === secId
              ? { ...sec, fields: sec.fields.filter((f) => f.id !== fieldId) }
              : sec
          )}
        : s
    ));
  }
  function bulkAddSectionFields(subId: string, secId: string, names: string[]) {
    const newFields = names.map((name) => ({ id: uid(), name, fieldType: "Text" }));
    saveSubsections(subsections.map((s) =>
      s.id === subId
        ? { ...s, sections: (s.sections ?? []).map((sec) =>
            sec.id === secId
              ? { ...sec, fields: [...sec.fields, ...newFields] }
              : sec
          )}
        : s
    ));
  }

  const [activeSubId, setActiveSubId] = useState<string | null>(subsections[0]?.id ?? null);

  // Keep active sub route valid as subsections change
  useEffect(() => {
    if (subsections.length === 0) { setActiveSubId(null); return; }
    if (!activeSubId || !subsections.find((s) => s.id === activeSubId)) {
      setActiveSubId(subsections[0].id);
    }
  }, [subsections, activeSubId]);

  const activeSub = subsections.find((s) => s.id === activeSubId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — only shown for default sections */}
      {section.isDefault && (
        <div className="flex-shrink-0 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <h4 className={`text-sm font-semibold ${hidden ? "text-slate-400" : "text-slate-900"}`}>{section.name}</h4>
            {hidden && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">Hidden</span>
            )}
          </div>
          {builderLink && !hidden && (
            <p className="mt-0.5 text-xs text-slate-400">
              Configure in the{" "}
              <Link href={`/projects/${projectId}/${builderLink.path}`} className="font-medium text-[var(--color-blue)] hover:underline">
                {builderLink.label} →
              </Link>
            </p>
          )}
        </div>
      )}
      {/* Hidden badge for user-created sections */}
      {!section.isDefault && hidden && (
        <div className="flex-shrink-0 border-b border-slate-100 px-5 py-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">Hidden</span>
        </div>
      )}

      {isBorrowingStructure && !hidden && (
        <div className="flex-shrink-0 overflow-y-auto border-b border-slate-100 px-5 py-4">
          <EntityInvolvementPlayground
            typeNames={typeNames}
            onOpenManage={() => setManageInvolvementOpen(true)}
          />
          <ManageInvolvementTypesDialog
            open={manageInvolvementOpen}
            onOpenChange={setManageInvolvementOpen}
            projectId={projectId}
          />
        </div>
      )}

      {isSecurity && !hidden && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <CollateralPreviewPlayground
            projectId={projectId}
            typeValues={collateralTypeValues}
            subtypesForType={collateralSubtypesForType}
          />
        </div>
      )}

      {isCovenants && !hidden && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <CovenantsPreviewPlayground projectId={projectId} />
        </div>
      )}

      {isConditions && !hidden && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ConditionsPreviewPlayground projectId={projectId} />
        </div>
      )}

      {isFees && !hidden && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FeesPreviewPlayground projectId={projectId} />
        </div>
      )}

      {isPolicyExceptions && !hidden && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <PolicyExceptionsPreviewPlayground projectId={projectId} />
        </div>
      )}

      <div className={`relative overflow-hidden ${isSecurity || isBorrowingStructure || isCovenants || isConditions || isFees || isPolicyExceptions ? "flex-shrink-0" : "flex-1"}`}>
        <div className={`flex h-full flex-col ${hidden ? "pointer-events-none select-none" : ""}`}>
          {!section.isDefault && (
            <>
              {/* Sub route tab bar */}
              <div className="flex-shrink-0 border-b border-slate-200 bg-white px-5">
                <div className="flex items-center gap-0">
                  {subsections.map((sub) => (
                    <SubRouteTab
                      key={sub.id}
                      sub={sub}
                      isActive={activeSubId === sub.id}
                      onSelect={() => setActiveSubId(sub.id)}
                      onRename={(name) => updateSubsectionName(sub.id, name)}
                      onDelete={() => deleteSubsection(sub.id)}
                    />
                  ))}
                  <button
                    onClick={() => {
                      const newSub = { id: uid(), name: "New Sub Route", fields: [], sections: [] };
                      const next = [...subsections, newSub];
                      saveSubsections(next);
                      setActiveSubId(newSub.id);
                    }}
                    className="ml-1 rounded px-2.5 py-1.5 text-xs font-medium text-[var(--color-blue)] hover:bg-[var(--color-blue)]/10"
                  >
                    + Add Sub Route
                  </button>
                </div>
              </div>

              {/* Active sub route content — keyed so state resets when switching tabs */}
              {activeSub ? (
                <SubRouteContent
                  key={activeSub.id}
                  sub={activeSub}
                  onDescriptionChange={(desc) => updateSubsectionDescription(activeSub.id, desc)}
                  onAddSection={() => addSection(activeSub.id)}
                  onUpdateSectionName={(secId, name) => updateSectionName(activeSub.id, secId, name)}
                  onDeleteSection={(secId) => deleteSection(activeSub.id, secId)}
                  onAddSectionField={(secId) => addSectionField(activeSub.id, secId)}
                  onUpdateSectionField={(secId, fieldId, patch) => updateSectionField(activeSub.id, secId, fieldId, patch)}
                  onDeleteSectionField={(secId, fieldId) => deleteSectionField(activeSub.id, secId, fieldId)}
                  onBulkAddSectionFields={(secId, names) => bulkAddSectionFields(activeSub.id, secId, names)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-slate-400">Add a sub route above to start configuring.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Hidden overlay */}
        {hidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 backdrop-blur-[1px]">
            <p className="text-sm text-slate-400">This section is hidden. Use the sidebar to show it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubRouteContent({
  sub,
  onDescriptionChange,
  onAddSection,
  onUpdateSectionName,
  onDeleteSection,
  onAddSectionField,
  onUpdateSectionField,
  onDeleteSectionField,
  onBulkAddSectionFields,
}: {
  sub: Subsection;
  onDescriptionChange: (desc: string) => void;
  onAddSection: () => void;
  onUpdateSectionName: (secId: string, name: string) => void;
  onDeleteSection: (secId: string) => void;
  onAddSectionField: (secId: string) => void;
  onUpdateSectionField: (secId: string, fieldId: string, patch: Partial<Field>) => void;
  onDeleteSectionField: (secId: string, fieldId: string) => void;
  onBulkAddSectionFields: (secId: string, names: string[]) => void;
}) {
  const [desc, setDesc] = useState(sub.description ?? "");
  const sections = sub.sections ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe in plain English what you want to see in this sub route…"
          rows={2}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] resize-none"
        />
      </div>

      {/* Sections */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Sections</span>
          <button
            onClick={onAddSection}
            className="rounded px-2 py-0.5 text-xs font-medium text-[var(--color-blue)] hover:bg-[var(--color-blue)]/10"
          >
            + Add Section
          </button>
        </div>

        {sections.length === 0 ? (
          <p className="text-xs text-slate-400">No sections yet. Click + Add Section to start.</p>
        ) : (
          <div className="space-y-3">
            {sections.map((sec) => (
              <SectionCard
                key={sec.id}
                sec={sec}
                onRename={(name) => onUpdateSectionName(sec.id, name)}
                onDelete={() => onDeleteSection(sec.id)}
                onAddField={() => onAddSectionField(sec.id)}
                onUpdateField={(fieldId, patch) => onUpdateSectionField(sec.id, fieldId, patch)}
                onDeleteField={(fieldId) => onDeleteSectionField(sec.id, fieldId)}
                onBulkAddFields={(names) => onBulkAddSectionFields(sec.id, names)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  sec,
  onRename,
  onDelete,
  onAddField,
  onUpdateField,
  onDeleteField,
  onBulkAddFields,
}: {
  sec: SubSection;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddField: () => void;
  onUpdateField: (fieldId: string, patch: Partial<Field>) => void;
  onDeleteField: (fieldId: string) => void;
  onBulkAddFields: (names: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(sec.name);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");

  function commitName() {
    setEditing(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== sec.name) onRename(trimmed);
    else setNameVal(sec.name);
  }

  function handlePasteConfirm() {
    const names = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (names.length) onBulkAddFields(names);
    setPasteText("");
    setPasting(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between rounded-t-lg border-b border-slate-200 bg-white px-3 py-2">
        {editing ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameVal(sec.name); setEditing(false); } }}
            className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm font-medium focus:outline-none focus:border-[var(--color-blue)]"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm font-medium text-slate-800 hover:text-[var(--color-blue)]"
            title="Click to rename"
          >
            {sec.name}
          </button>
        )}
        <div className="ml-2 flex items-center gap-1">
          <button
            onClick={onAddField}
            className="rounded px-2 py-0.5 text-xs font-medium text-[var(--color-blue)] hover:bg-[var(--color-blue)]/10"
          >
            + Field
          </button>
          <button
            onClick={() => setPasting((p) => !p)}
            className="rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
            title="Paste a list of fields"
          >
            Paste list
          </button>
          <button
            onClick={onDelete}
            className="rounded px-1 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
            title="Delete section"
          >×</button>
        </div>
      </div>

      {pasting && (
        <div className="border-b border-slate-200 bg-white px-3 py-2">
          <p className="mb-1 text-xs text-slate-500">Paste field names — one per line:</p>
          <textarea
            autoFocus
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--color-blue)] resize-none"
            placeholder={"Field name 1\nField name 2\nField name 3"}
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={handlePasteConfirm}
              disabled={!pasteText.trim()}
              className="rounded bg-[var(--color-blue)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40 hover:bg-[var(--color-blue-hover)]"
            >
              Add {pasteText.split("\n").filter((l) => l.trim()).length || ""} fields
            </button>
            <button
              onClick={() => { setPasting(false); setPasteText(""); }}
              className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sec.fields.length === 0 && !pasting ? (
        <p className="px-3 py-2 text-xs text-slate-400">No fields. Click + Field or Paste list to add.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {sec.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              onUpdate={(patch) => onUpdateField(field.id, patch)}
              onDelete={() => onDeleteField(field.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubRouteTab({
  sub,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  sub: Subsection;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(sub.name);

  function commitName() {
    setEditing(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== sub.name) onRename(trimmed);
    else setNameVal(sub.name);
  }

  return (
    <div className={`group relative flex items-center border-b-2 ${isActive ? "border-[var(--color-blue)]" : "border-transparent"}`}>
      {editing ? (
        <input
          autoFocus
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") { setNameVal(sub.name); setEditing(false); }
          }}
          className="my-1.5 w-28 rounded border border-slate-300 px-2 py-0.5 text-sm focus:outline-none focus:border-[var(--color-blue)]"
        />
      ) : (
        <button
          onClick={onSelect}
          onDoubleClick={() => setEditing(true)}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? "text-[var(--color-blue)]" : "text-slate-500 hover:text-slate-800"
          }`}
          title="Double-click to rename"
        >
          {sub.name}
        </button>
      )}
      {/* Delete on hover */}
      {!editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="mr-1 hidden rounded px-0.5 text-[10px] text-red-400 hover:text-red-600 group-hover:block"
          title="Delete sub route"
        >×</button>
      )}
    </div>
  );
}

// Config per numeric-ish type: [maxTotal, defaultLength, defaultDp, maxDp]
const NUMERIC_CONFIG: Record<string, [number, number, number, number]> = {
  Number:     [16, 14, 2, 15],
  Currency:   [18, 16, 2, 17],
  Percentage: [18,  3, 2, 17],
};

function applyTypeDefaults(fieldType: string): Partial<Field> {
  const cfg = NUMERIC_CONFIG[fieldType];
  if (cfg) return { fieldType, length: cfg[1], decimalPlaces: cfg[2], picklistValues: undefined };
  if (fieldType === "Picklist") return { fieldType, length: undefined, decimalPlaces: undefined };
  return { fieldType, length: undefined, decimalPlaces: undefined, picklistValues: undefined };
}

function FieldRow({
  field,
  onUpdate,
  onDelete,
}: {
  field: Field;
  onUpdate: (patch: Partial<Field>) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(field.name);
  const [newPicklistVal, setNewPicklistVal] = useState("");

  function commitName() {
    setEditingName(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== field.name) onUpdate({ name: trimmed });
    else setNameVal(field.name);
  }

  function addPicklistValue() {
    const trimmed = newPicklistVal.trim();
    if (!trimmed) return;
    const current = field.picklistValues ?? [];
    if (current.includes(trimmed)) { setNewPicklistVal(""); return; }
    onUpdate({ picklistValues: [...current, trimmed] });
    setNewPicklistVal("");
  }

  function removePicklistValue(val: string) {
    onUpdate({ picklistValues: (field.picklistValues ?? []).filter((v) => v !== val) });
  }

  const numCfg = NUMERIC_CONFIG[field.fieldType];
  const length = field.length ?? (numCfg ? numCfg[1] : 0);
  const dp = field.decimalPlaces ?? (numCfg ? numCfg[2] : 0);
  const maxTotal = numCfg ? numCfg[0] : 0;
  const maxDp = numCfg ? numCfg[3] : 0;
  const totalExceeded = numCfg && (length + dp) > maxTotal;
  const dpExceeded = numCfg && dp > maxDp;
  const lengthError = totalExceeded ? `Length + decimal places must not exceed ${maxTotal}` : null;
  const dpError = dpExceeded ? `Max decimal places is ${maxDp}` : (totalExceeded ? `Length + decimal places must not exceed ${maxTotal}` : null);

  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center gap-2">
        {/* Field name — fixed width so all rows align regardless of extra inputs */}
        <div className="w-40 shrink-0 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameVal(field.name); setEditingName(false); } }}
              className="w-full rounded border border-slate-300 px-2 py-0.5 text-xs focus:outline-none focus:border-[var(--color-blue)]"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="w-full truncate text-left text-xs text-slate-700 hover:text-[var(--color-blue)]"
              title="Click to rename"
            >
              {field.name}
            </button>
          )}
        </div>

        {/* Field type */}
        <select
          value={field.fieldType}
          onChange={(e) => onUpdate(applyTypeDefaults(e.target.value))}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 focus:outline-none focus:border-[var(--color-blue)]"
        >
          {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Spacer pushes Len/DP and delete to the right */}
        <div className="flex-1" />

        {/* Inline numeric config — pinned to the right */}
        {numCfg && (
          <>
            <span className="text-[10px] text-slate-400 shrink-0">Len</span>
            <input
              type="number"
              min={1}
              max={maxTotal - 1}
              value={length}
              onChange={(e) => onUpdate({ length: Math.max(1, parseInt(e.target.value) || 1) })}
              title={lengthError ?? `Max length: ${maxTotal - 1}`}
              className={`w-10 rounded border px-1.5 py-0.5 text-[10px] text-center focus:outline-none ${lengthError ? "border-red-400 bg-red-50 text-red-600 focus:border-red-500" : "border-slate-200 focus:border-[var(--color-blue)]"}`}
            />
            <span className="text-[10px] text-slate-400 shrink-0">DP</span>
            <input
              type="number"
              min={0}
              max={maxDp}
              value={dp}
              onChange={(e) => onUpdate({ decimalPlaces: Math.max(0, parseInt(e.target.value) || 0) })}
              title={dpError ?? `Max decimal places: ${maxDp}`}
              className={`w-10 rounded border px-1.5 py-0.5 text-[10px] text-center focus:outline-none ${dpError ? "border-red-400 bg-red-50 text-red-600 focus:border-red-500" : "border-slate-200 focus:border-[var(--color-blue)]"}`}
            />
          </>
        )}

        {/* Delete */}
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-600 shrink-0"
          title="Delete field"
        >×</button>
      </div>

      {/* Picklist values editor */}
      {field.fieldType === "Picklist" && (
        <div className="mt-1.5 border-l-2 border-slate-200 pl-2">
          <div className="flex flex-wrap gap-1 mb-1">
            {(field.picklistValues ?? []).map((val) => (
              <span key={val} className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-700">
                {val}
                <button onClick={() => removePicklistValue(val)} className="ml-0.5 text-blue-400 hover:text-red-500 leading-none">×</button>
              </span>
            ))}
            {(field.picklistValues ?? []).length === 0 && (
              <span className="text-[10px] text-slate-400 italic">No values yet</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <input
              value={newPicklistVal}
              onChange={(e) => setNewPicklistVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPicklistValue(); }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!text.includes("\n")) return;
                e.preventDefault();
                const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                if (lines.length === 0) return;
                const current = field.picklistValues ?? [];
                const toAdd = lines.filter((l) => !current.includes(l));
                if (toAdd.length > 0) onUpdate({ picklistValues: [...current, ...toAdd] });
                setNewPicklistVal("");
              }}
              placeholder="Add value… or paste a list"
              className="flex-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] focus:outline-none focus:border-[var(--color-blue)]"
            />
            <button
              onClick={addPicklistValue}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200"
            >Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export Dialog ─────────────────────────────────────────────────────────────

function ExportDialog({
  open,
  onOpenChange,
  projectName,
  hasFieldErrors,
  onExport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectName: string;
  hasFieldErrors: boolean;
  onExport: (scope: "ui" | "all", format: "yaml" | "excel") => void;
}) {
  const [scope, setScope] = useState<"ui" | "all">("ui");
  const [format, setFormat] = useState<"yaml" | "excel">("yaml");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => onOpenChange(false)}>
      <div
        className="w-[420px] rounded-xl bg-white shadow-xl border border-slate-200 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900 mb-1">Export</h3>
        <p className="text-xs text-slate-500 mb-5">{projectName}</p>

        {/* Scope */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">What to export</p>
          <div className="space-y-2">
            {([
              { value: "ui", label: "UI Configuration", desc: "Stages and routes only" },
              { value: "all", label: "All Configuration", desc: "Stages + Fees, Conditions, and Policy Exceptions" },
            ] as const).map(({ value, label, desc }) => (
              <label key={value} className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${scope === value ? "border-[var(--color-blue)] bg-[var(--color-blue)]/5" : "border-slate-200 hover:border-slate-300"}`}>
                <input
                  type="radio"
                  name="export-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  className="mt-0.5 accent-[var(--color-blue)]"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">File format</p>
          <div className="flex gap-3">
            {([
              { value: "yaml", label: "YAML", desc: ".yaml" },
              { value: "excel", label: "Excel", desc: ".xls" },
            ] as const).map(({ value, label, desc }) => (
              <label key={value} className={`flex flex-1 items-center gap-2 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${format === value ? "border-[var(--color-blue)] bg-[var(--color-blue)]/5" : "border-slate-200 hover:border-slate-300"}`}>
                <input
                  type="radio"
                  name="export-format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                  className="accent-[var(--color-blue)]"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {scope === "all" && (
          <p className="text-xs text-slate-400 mb-4 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
            All Configuration exports multiple files — one per feature builder.
          </p>
        )}

        {hasFieldErrors && (
          <p className="text-xs text-red-600 mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2">
            Some fields have invalid length or decimal place values. Fix the errors before exporting.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={hasFieldErrors}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onExport(scope, format)}
          >
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
