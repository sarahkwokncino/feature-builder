"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  parseStagesFile,
  type StageImportRow,
} from "@/lib/export-import";
import { EntityInvolvementPlayground, ManageInvolvementTypesDialog } from "@/components/entity-involvement/entity-involvement-tool";
import { CollateralPreviewPlayground } from "@/components/collateral/collateral-tool";
import { CovenantsPreviewPlayground } from "@/components/covenants/covenants-tool";
import { ConditionsPreviewPlayground } from "@/components/conditions/conditions-tool";
import { FeesPreviewPlayground } from "@/components/fees/fees-tool";
import { PolicyExceptionsPreviewPlayground } from "@/components/policy-exceptions/policy-exceptions-tool";
import { DocmanPreviewPlayground } from "@/components/docman/docman-tool";
import { ChecklistPreviewPlayground } from "@/components/checklist/checklist-tool";
import { COLLATERAL_TYPE_SUBTYPE_MAP, COLLATERAL_SUBTYPE_KEY_PREFIX } from "@/lib/picklist-defaults";

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
  const [addingSectionForStage, setAddingSectionForStage] = useState<Id<"stages"> | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<Id<"stageSections"> | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const addStageInputRef = useRef<HTMLInputElement>(null);
  const addSectionInputRef = useRef<HTMLInputElement>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  function buildExportData() {
    return {
      stages: stages.map((stage) => ({
        name: stage.name,
        isFixed: stage.isFixed,
        enabledTabs: stage.enabledTabs,
        sections: sections
          .filter((s) => s.stageId === stage._id)
          .map((s) => ({
            name: s.name,
            isDefault: s.isDefault,
            isHidden: s.isHidden,
            description: s.description,
            subsections: s.subsections as StageImportRow["subsections"],
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
    <div className="flex h-full flex-col">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      {/* Stage path bar */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Stages — {project.name}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>Import</Button>
            <Button size="sm" variant="outline" onClick={() => downloadStagesExcel(buildExportData())}>Export Excel</Button>
            <Button size="sm" variant="outline" onClick={() => setYamlOpen(true)}>Export YAML</Button>
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
        <div className="flex flex-wrap items-center gap-1">
          {stages.map((stage, idx) => (
            <div key={stage._id} className="flex items-center">
              {/* Stage pill */}
              <button
                onClick={() => setSelectedStageId(stage._id)}
                className={`group relative flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedStageId === stage._id
                    ? "bg-[var(--color-blue)] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {editingStageId === stage._id ? (
                  <input
                    autoFocus
                    value={editStageName}
                    onChange={(e) => setEditStageName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") handleRenameStage();
                      if (e.key === "Escape") setEditingStageId(null);
                    }}
                    onBlur={handleRenameStage}
                    onClick={(e) => e.stopPropagation()}
                    className="w-32 rounded border border-white/50 bg-white/20 px-1 text-sm text-white placeholder:text-white/60 focus:outline-none"
                  />
                ) : (
                  <span>{stage.name}</span>
                )}

                {/* Actions shown on hover */}
                {!editingStageId && (
                  <span className="ml-1 hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                    {/* Move left */}
                    {idx > 0 && !stage.isFixed && (
                      <span
                        onClick={() => handleMoveStage(stage, -1)}
                        className="cursor-pointer rounded px-0.5 text-xs opacity-70 hover:opacity-100"
                        title="Move left"
                      >←</span>
                    )}
                    {/* Move right */}
                    {idx < stages.length - 1 && !stage.isFixed && !stages[idx + 1]?.isFixed && (
                      <span
                        onClick={() => handleMoveStage(stage, 1)}
                        className="cursor-pointer rounded px-0.5 text-xs opacity-70 hover:opacity-100"
                        title="Move right"
                      >→</span>
                    )}
                    {/* Rename */}
                    {!stage.isFixed && (
                      <span
                        onClick={() => { setEditingStageId(stage._id); setEditStageName(stage.name); }}
                        className="cursor-pointer rounded px-0.5 text-xs opacity-70 hover:opacity-100"
                        title="Rename"
                      >✎</span>
                    )}
                    {/* Delete */}
                    {!stage.isFixed && (
                      <span
                        onClick={() => handleDeleteStage(stage)}
                        className="cursor-pointer rounded px-0.5 text-xs text-red-300 hover:text-red-100"
                        title="Delete"
                      >×</span>
                    )}
                  </span>
                )}
              </button>

              {/* Arrow separator */}
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

        {selectedStage?.isFixed && (
          <p className="mt-2 text-xs text-slate-400">
            <span className="font-medium text-slate-500">{selectedStage.name}</span> is a fixed stage — it cannot be renamed or removed.
          </p>
        )}
      </div>

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
                onMoveSection={handleMoveSection}
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
  onMoveSection,
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
  onMoveSection: (s: Doc<"stageSections">, dir: -1 | 1) => void;
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
      <div className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200">
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

        <ul className="flex-1 overflow-y-auto py-1">
          {sections.map((section, idx) => (
            <li
              key={section._id}
              className={`group flex items-center gap-1 px-2 py-0.5 ${
                selectedSectionId === section._id ? "bg-slate-100" : "hover:bg-slate-50"
              } ${section.isHidden ? "opacity-50" : ""}`}
            >
              {/* Reorder */}
              <div className="flex flex-col opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => onMoveSection(section, -1)}
                  disabled={idx === 0}
                  className="px-0.5 text-[9px] text-slate-300 hover:text-slate-600 disabled:opacity-20"
                  title="Move up"
                >▲</button>
                <button
                  onClick={() => onMoveSection(section, 1)}
                  disabled={idx === sections.length - 1}
                  className="px-0.5 text-[9px] text-slate-300 hover:text-slate-600 disabled:opacity-20"
                  title="Move down"
                >▼</button>
              </div>

              {/* Name / inline edit */}
              <div className="flex-1 min-w-0">
                {editingSectionId === section._id ? (
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
                    onClick={() => setSelectedSectionId(section._id)}
                    className={`w-full truncate py-1.5 text-left text-sm ${
                      selectedSectionId === section._id
                        ? "font-medium text-slate-900"
                        : "text-slate-700"
                    } ${section.isHidden ? "line-through" : ""}`}
                  >
                    {section.name}
                  </button>
                )}
              </div>

              {/* Hover actions */}
              {editingSectionId !== section._id && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => { onStartEditSection(section); setSelectedSectionId(section._id); }}
                    className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    title="Rename"
                  >✎</button>
                  <button
                    onClick={() => onToggleSectionHidden(section)}
                    className={`rounded px-1 py-0.5 text-[10px] hover:bg-slate-200 ${
                      section.isHidden
                        ? "text-slate-400 hover:text-slate-700"
                        : "text-slate-400 hover:text-slate-700"
                    }`}
                    title={section.isHidden ? "Show section" : "Hide section"}
                  >{section.isHidden ? "Show" : "Hide"}</button>
                  {!section.isDefault && (
                    <button
                      onClick={() => onDeleteSection(section._id)}
                      className="rounded px-1 py-0.5 text-[10px] text-red-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >×</button>
                  )}
                </div>
              )}
            </li>
          ))}

          {/* Inline add row */}
          {addingSectionForStage === stage._id && (
            <li className="px-2 py-1.5">
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
            </li>
          )}

          {sections.length === 0 && addingSectionForStage !== stage._id && (
            <li className="px-3 py-4 text-center text-xs text-slate-400">
              No routes yet.<br />Click + Add to start.
            </li>
          )}
        </ul>
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
type Field = { id: string; name: string; fieldType: string };

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

  function commitName() {
    setEditingName(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== field.name) onUpdate({ name: trimmed });
    else setNameVal(field.name);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      {/* Field name */}
      <div className="flex-1 min-w-0">
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
            className="truncate text-left text-xs text-slate-700 hover:text-[var(--color-blue)]"
            title="Click to rename"
          >
            {field.name}
          </button>
        )}
      </div>

      {/* Field type */}
      <select
        value={field.fieldType}
        onChange={(e) => onUpdate({ fieldType: e.target.value })}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 focus:outline-none focus:border-[var(--color-blue)]"
      >
        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="text-xs text-red-400 hover:text-red-600"
        title="Delete field"
      >×</button>
    </div>
  );
}
