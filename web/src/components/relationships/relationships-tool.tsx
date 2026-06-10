"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ExportButton } from "@/components/ui/export-button";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import {
  buildRelationshipsYaml,
  downloadRelationshipsYaml,
  downloadRelationshipsExcel,
  parseRelationshipsFile,
  type RelationshipRow,
  type RelationshipFieldConfig,
} from "@/lib/export-import";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_TYPES = ["Individual", "Business", "Household", "Lender", "Vendor"];

// ── Manage Relationship Types Dialog ─────────────────────────────────────────

function ManageRelationshipTypesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const stored = useQuery(api.picklists.listForScope, { scope: "relationships" });
  const addValue = useMutation(api.picklists.addValue);
  const setValues = useMutation(api.picklists.setValues);

  const [newTypeInput, setNewTypeInput] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // User-added types stored under key "types"
  const userTypes = useMemo(() => {
    return stored?.find((r) => r.key === "types")?.values ?? [];
  }, [stored]);

  // Hidden system types stored under key "hidden-types"
  const hiddenSystemTypes = useMemo(() => {
    return stored?.find((r) => r.key === "hidden-types")?.values ?? [];
  }, [stored]);

  const allTypes = useMemo(() => [...SYSTEM_TYPES, ...userTypes], [userTypes]);

  async function handleAddType() {
    const val = newTypeInput.trim();
    if (!val || allTypes.includes(val)) return;
    await addValue({ scope: "relationships", key: "types", value: val });
    setNewTypeInput("");
  }

  async function handleRemoveUserType(type: string) {
    await setValues({ scope: "relationships", key: "types", values: userTypes.filter((t) => t !== type) });
  }

  async function toggleHideSystemType(type: string) {
    const isHidden = hiddenSystemTypes.includes(type);
    await setValues({
      scope: "relationships",
      key: "hidden-types",
      values: isHidden
        ? hiddenSystemTypes.filter((t) => t !== type)
        : [...hiddenSystemTypes, type],
    });
  }

  async function handlePasteAdd() {
    const lines = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !allTypes.includes(l));
    if (!lines.length) { setPasteMode(false); setPasteText(""); return; }
    await setValues({ scope: "relationships", key: "types", values: [...userTypes, ...lines] });
    setPasteText("");
    setPasteMode(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Relationship Types</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ maxHeight: "440px" }}>
          {/* System types */}
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">System Types</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Built-in — cannot be removed. Toggle visibility in the dropdown.</p>
          </div>
          <ul className="p-1.5 space-y-0.5 border-b border-slate-200">
            {SYSTEM_TYPES.map((t) => {
              const isHidden = hiddenSystemTypes.includes(t);
              return (
                <li key={t} className="flex items-center justify-between rounded px-2.5 py-1.5 text-sm hover:bg-slate-50">
                  <span className={isHidden ? "text-slate-400 line-through" : "text-slate-800"}>{t}</span>
                  <button
                    onClick={() => toggleHideSystemType(t)}
                    className={`text-[11px] font-medium ${isHidden ? "text-[var(--color-blue)]" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {isHidden ? "Show" : "Hide"}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* User-added types */}
          <div className="bg-slate-50 px-3 py-2 flex items-center justify-between border-b border-slate-200">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Custom Types</p>
            <button
              onClick={() => { setPasteMode((v) => !v); setPasteText(""); }}
              className="text-[11px] text-[var(--color-blue)] hover:underline"
            >
              {pasteMode ? "Cancel paste" : "Paste list"}
            </button>
          </div>

          {pasteMode ? (
            <div className="p-3 space-y-2">
              <p className="text-xs text-slate-500">Paste one relationship type per line — duplicates are ignored.</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"e.g. Partner\nTrustee"}
                rows={5}
                autoFocus
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] resize-none"
              />
              <Button size="sm" onClick={handlePasteAdd} className="w-full text-xs h-7">
                Add {pasteText.split("\n").filter((l) => l.trim() && !allTypes.includes(l.trim())).length} type(s)
              </Button>
            </div>
          ) : (
            <>
              <ul className="overflow-y-auto p-1.5 space-y-0.5" style={{ maxHeight: "140px" }}>
                {userTypes.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-slate-400 italic">No custom types yet.</li>
                )}
                {userTypes.map((t) => (
                  <li key={t} className="flex items-center justify-between rounded px-2.5 py-1.5 text-sm hover:bg-slate-50 group">
                    <span>{t}</span>
                    <button
                      onClick={() => handleRemoveUserType(t)}
                      className="hidden group-hover:block text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-200 p-2 flex gap-1.5">
                <Input
                  value={newTypeInput}
                  onChange={(e) => setNewTypeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddType(); }}
                  placeholder="New custom type…"
                  className="text-xs h-7"
                />
                <Button size="sm" onClick={handleAddType} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
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

// ── Defaults & types ─────────────────────────────────────────────────────────

type Field = { name: string; fieldType: string; picklistValues?: string[] };
type Section = { id: string; name: string; fields: Field[] };

const SF_FIELD_TYPES = [
  "Free Text", "Text(255)", "Text(100)", "Text(512)", "Text Area", "Text Area (Long)",
  "Date", "Date/Time", "Number", "Currency", "Percent",
  "Checkbox", "Picklist", "Multi-Select", "Lookup", "Lookup (user)", "Read only", "URL", "Email", "Phone",
];

const DEFAULT_SECTIONS_BY_TYPE: Record<string, Section[]> = {
  Individual: [
    {
      id: "individual-personal",
      name: "Personal Details",
      fields: [
        { name: "Salutation", fieldType: "Picklist" },
        { name: "First Name", fieldType: "Free Text" },
        { name: "Middle Name", fieldType: "Free Text" },
        { name: "Last Name", fieldType: "Free Text" },
        { name: "Date of Birth", fieldType: "Date" },
        { name: "Email", fieldType: "Free Text" },
        { name: "Phone", fieldType: "Free Text" },
        { name: "Relationship Owner", fieldType: "Lookup (user)" },
      ],
    },
    {
      id: "individual-registered-address",
      name: "Registered Address",
      fields: [
        { name: "Registered Address", fieldType: "Lookup" },
        { name: "Registered Street", fieldType: "Free Text" },
        { name: "Registered City", fieldType: "Free Text" },
        { name: "Registered County", fieldType: "Free Text" },
        { name: "Registered Post Code", fieldType: "Free Text" },
        { name: "Registered Country", fieldType: "Picklist" },
      ],
    },
    {
      id: "individual-correspondence-address",
      name: "Correspondence Address",
      fields: [
        { name: "Correspondence Address", fieldType: "Lookup" },
        { name: "Correspondence Street", fieldType: "Free Text" },
        { name: "Correspondence City", fieldType: "Free Text" },
        { name: "Correspondence County", fieldType: "Free Text" },
        { name: "Correspondence Post Code", fieldType: "Free Text" },
        { name: "Correspondence Country", fieldType: "Picklist" },
      ],
    },
  ],
  Business: [
    {
      id: "business-details",
      name: "Business Details",
      fields: [
        { name: "Relationship Name", fieldType: "Free Text" },
        { name: "Relationship Type", fieldType: "Picklist" },
        { name: "Relationship ID", fieldType: "Free Text" },
        { name: "Company Registration Number", fieldType: "Free Text" },
        { name: "Status", fieldType: "Picklist" },
        { name: "Phone", fieldType: "Free Text" },
        { name: "Email Address", fieldType: "Free Text" },
        { name: "Relationship Owner", fieldType: "Read only" },
        { name: "Credit Score", fieldType: "Free Text" },
        { name: "Credit Score Date", fieldType: "Date" },
        { name: "Description", fieldType: "Free Text" },
      ],
    },
    {
      id: "business-registered-address",
      name: "Registered Address",
      fields: [
        { name: "Registered Address", fieldType: "Free Text" },
        { name: "Registered Street", fieldType: "Free Text" },
        { name: "Registered City", fieldType: "Free Text" },
        { name: "Registered County", fieldType: "Free Text" },
        { name: "Registered Post Code", fieldType: "Free Text" },
        { name: "Registered Country", fieldType: "Picklist" },
      ],
    },
    {
      id: "business-correspondence-address",
      name: "Correspondence Address",
      fields: [
        { name: "Correspondence Address", fieldType: "Lookup" },
        { name: "Correspondence Street", fieldType: "Free Text" },
        { name: "Correspondence City", fieldType: "Free Text" },
        { name: "Correspondence County", fieldType: "Free Text" },
        { name: "Correspondence Post Code", fieldType: "Free Text" },
        { name: "Correspondence Country", fieldType: "Picklist" },
        { name: "Correspondence Address - Registered?", fieldType: "Picklist" },
      ],
    },
    {
      id: "business-bank-details",
      name: "Bank Details",
      fields: [
        { name: "Bank Name", fieldType: "Free Text" },
        { name: "Account Name", fieldType: "Free Text" },
        { name: "Account Number", fieldType: "Free Text" },
        { name: "Sort Code", fieldType: "Free Text" },
        { name: "IBAN", fieldType: "Free Text" },
      ],
    },
  ],
  Vendor: [
    {
      id: "vendor-details",
      name: "Vendor Details",
      fields: [
        { name: "Relationship Name", fieldType: "Free Text" },
        { name: "Relationship Type", fieldType: "Picklist" },
        { name: "Third Party Type", fieldType: "Multi-Select" },
        { name: "Phone", fieldType: "Free Text" },
        { name: "Is Non-Customer", fieldType: "Checkbox" },
        { name: "Email Address", fieldType: "Free Text" },
        { name: "Description", fieldType: "Free Text" },
      ],
    },
    {
      id: "vendor-bank-details",
      name: "Bank Details",
      fields: [
        { name: "Bank Name", fieldType: "Free Text" },
        { name: "Account Name", fieldType: "Free Text" },
        { name: "Account Number", fieldType: "Free Text" },
        { name: "Sort Code", fieldType: "Free Text" },
        { name: "IBAN", fieldType: "Free Text" },
      ],
    },
    {
      id: "vendor-registered-address",
      name: "Registered Address",
      fields: [
        { name: "Registered Address", fieldType: "Lookup" },
        { name: "Registered Street", fieldType: "Free Text" },
        { name: "Registered City", fieldType: "Free Text" },
        { name: "Registered County", fieldType: "Free Text" },
        { name: "Registered Post Code", fieldType: "Free Text" },
        { name: "Registered Country", fieldType: "Picklist" },
      ],
    },
    {
      id: "vendor-correspondence-address",
      name: "Correspondence Address",
      fields: [
        { name: "Correspondence Address", fieldType: "Lookup" },
        { name: "Correspondence Street", fieldType: "Free Text" },
        { name: "Correspondence City", fieldType: "Free Text" },
        { name: "Correspondence County", fieldType: "Free Text" },
        { name: "Correspondence Post Code", fieldType: "Free Text" },
        { name: "Correspondence Country", fieldType: "Picklist" },
      ],
    },
  ],
};

const DEFAULT_SECTIONS: Section[] = [
  {
    id: "relationship-details",
    name: "Relationship Details",
    fields: [
      { name: "Start Date", fieldType: "Date" },
      { name: "End Date", fieldType: "Date" },
      { name: "Notes", fieldType: "Text Area (Long)" },
    ],
  },
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Field Config Panel ────────────────────────────────────────────────────────

function FieldConfigPanel({
  projectId,
  relationshipType,
  allTypes,
  isLocked,
}: {
  projectId: Id<"projects">;
  relationshipType: string;
  allTypes: string[];
  isLocked: boolean;
}) {
  const saved = useQuery(api.relationships.getFieldConfig, { projectId, relationshipType });
  const allConfigs = useQuery(api.relationships.listFieldConfigs, { projectId });
  const saveConfig = useMutation(api.relationships.saveFieldConfig);
  const setLinkedTo = useMutation(api.relationships.setLinkedTo);

  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [newFieldInputs, setNewFieldInputs] = useState<Record<string, { name: string; fieldType: string }>>({});
  const [newPicklistInputs, setNewPicklistInputs] = useState<Record<string, string>>({});
  const [picklistPasteMode, setPicklistPasteMode] = useState<Record<string, boolean>>({});
  const [picklistPasteText, setPicklistPasteText] = useState<Record<string, string>>({});
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneType, setCloneType] = useState("");
  const [cloneToOpen, setCloneToOpen] = useState(false);
  const [cloneToType, setCloneToType] = useState("");
  const [sameAsOpen, setSameAsOpen] = useState(false);
  const [sameAsType, setSameAsType] = useState("");

  const linkedTo = saved?.linkedTo ?? null;

  const sourceConfig = useQuery(
    api.relationships.getFieldConfig,
    linkedTo ? { projectId, relationshipType: linkedTo.relationshipType } : "skip",
  );

  const displaySections = useMemo<Section[]>(() => {
    if (!linkedTo) return sections;
    if (!sourceConfig) return [];
    return (sourceConfig.sections as Section[]).map((s: any) => ({
      ...s,
      fields: (s.fields as any[]).map((f) =>
        typeof f === "string" ? { name: f, fieldType: "Text(255)" } : f,
      ),
    }));
  }, [linkedTo, sourceConfig, sections]);

  useEffect(() => {
    if (saved === undefined) return;
    if (saved?.linkedTo) { setSections(DEFAULT_SECTIONS); return; }
    const typeDefaults = DEFAULT_SECTIONS_BY_TYPE[relationshipType];
    if (!saved) {
      persist(typeDefaults ?? DEFAULT_SECTIONS);
      return;
    }
    // Re-seed if saved config is the old generic auto-seed (single "relationship-details" section)
    // or a single-section seed whose id doesn't match the new type-specific defaults,
    // and this type now has specific defaults defined.
    const savedIds = saved.sections.map((s: any) => s.id);
    const defaultIds = typeDefaults?.map((s) => s.id) ?? [];
    const isOldGenericSeed =
      saved.sections.length === 1 &&
      (saved.sections[0] as any).id === "relationship-details";
    const isMismatchedSeed =
      typeDefaults !== undefined &&
      saved.sections.length > 0 &&
      !savedIds.some((id: string) => defaultIds.includes(id));
    if (typeDefaults && (isOldGenericSeed || isMismatchedSeed)) {
      persist(typeDefaults);
      return;
    }
    const migrated: Section[] = saved.sections.map((s: any) => ({
      ...s,
      fields: (s.fields as any[]).map((f) =>
        typeof f === "string" ? { name: f, fieldType: "Text(255)" } : f,
      ),
    }));
    setSections(migrated);
  }, [saved, relationshipType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(updated: Section[]) {
    setSections(updated);
    await saveConfig({ projectId, relationshipType, sections: updated, linkedTo: undefined });
  }

  function handleCloneConfirm() {
    if (!cloneType) return;
    const source = allConfigs?.find((c) => c.relationshipType === cloneType);
    const sourceSections: Section[] = source
      ? (source.sections as Section[]).map((s) => ({ ...s, id: newId(), fields: s.fields.map((f) => ({ ...f })) }))
      : DEFAULT_SECTIONS;
    persist(sourceSections);
    setCloneOpen(false);
  }

  async function handleCloneToConfirm() {
    if (!cloneToType) return;
    const clonedSections: Section[] = sections.map((s) => ({ ...s, id: newId(), fields: s.fields.map((f) => ({ ...f })) }));
    await saveConfig({ projectId, relationshipType: cloneToType, sections: clonedSections, linkedTo: undefined });
    setCloneToOpen(false);
    toast.success(`Cloned to ${cloneToType}`);
  }

  async function handleSameAsConfirm() {
    if (!sameAsType) return;
    await setLinkedTo({ projectId, relationshipType, linkedTo: { relationshipType: sameAsType } });
    setSameAsOpen(false);
  }

  async function handleRemoveLink() {
    await setLinkedTo({ projectId, relationshipType, linkedTo: undefined });
  }

  function addField(sectionId: string) {
    const input = newFieldInputs[sectionId];
    const name = (input?.name ?? "").trim();
    const fieldType = input?.fieldType ?? "Text(255)";
    if (!name) return;
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, fields: [...s.fields, { name, fieldType }] } : s,
    );
    setNewFieldInputs((prev) => ({ ...prev, [sectionId]: { name: "", fieldType: "Text(255)" } }));
    persist(updated);
  }

  function removeField(sectionId: string, fieldName: string) {
    persist(sections.map((s) =>
      s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.name !== fieldName) } : s,
    ));
  }

  function addPicklistValue(sectionId: string, fieldName: string, value: string) {
    persist(sections.map((s) =>
      s.id === sectionId ? {
        ...s,
        fields: s.fields.map((f) =>
          f.name === fieldName ? { ...f, picklistValues: [...(f.picklistValues ?? []), value] } : f,
        ),
      } : s,
    ));
  }

  function removePicklistValue(sectionId: string, fieldName: string, value: string) {
    persist(sections.map((s) =>
      s.id === sectionId ? {
        ...s,
        fields: s.fields.map((f) =>
          f.name === fieldName ? { ...f, picklistValues: (f.picklistValues ?? []).filter((v) => v !== value) } : f,
        ),
      } : s,
    ));
  }

  function renameSection(sectionId: string, name: string) {
    persist(sections.map((s) => s.id === sectionId ? { ...s, name } : s));
    setEditingSectionId(null);
  }

  function removeSection(sectionId: string) {
    persist(sections.filter((s) => s.id !== sectionId));
  }

  function addSection() {
    const name = newSectionName.trim();
    if (!name) return;
    persist([...sections, { id: newId(), name, fields: [] }]);
    setNewSectionName("");
    setAddingSectionOpen(false);
  }

  if (saved === undefined) return <div className="mt-6 text-sm text-slate-400">Loading fields…</div>;

  const otherTypes = allTypes.filter((t) => t !== relationshipType);

  return (
    <div className="mt-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Fields for <span className="text-[var(--color-blue)]">{relationshipType}</span>
        </h3>
        {!linkedTo && !isLocked && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setCloneType(""); setCloneOpen(true); }} className="text-xs h-7">
              Clone from…
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setCloneToType(""); setCloneToOpen(true); }} className="text-xs h-7">
              Clone to…
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setSameAsType(""); setSameAsOpen(true); }} className="text-xs h-7">
              Same as…
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddingSectionOpen(true)} className="text-xs h-7">
              + Add section
            </Button>
          </div>
        )}
      </div>

      {/* Same-as banner */}
      {linkedTo && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.101-1.102" />
          </svg>
          <div className="flex-1 text-sm text-blue-800">
            <span className="font-medium">Same as:</span>{" "}
            {linkedTo.relationshipType}
            <span className="ml-2 text-xs text-blue-600">(read-only — changes to the source are automatically reflected here)</span>
          </div>
          {!isLocked && (
            <Button size="sm" variant="outline" onClick={handleRemoveLink} className="text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-100">
              Remove link
            </Button>
          )}
        </div>
      )}

      {/* Clone from dialog */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Clone fields from another type</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">Select a relationship type to copy its sections and fields as an editable base. This will overwrite the current configuration.</p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Relationship Type</label>
            <select
              value={cloneType}
              onChange={(e) => setCloneType(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
            >
              <option value="">Select type…</option>
              {otherTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {cloneType && !allConfigs?.find((c) => c.relationshipType === cloneType) && (
              <p className="mt-1 text-xs text-amber-600">No saved config for this type — will clone default sections.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button disabled={!cloneType} onClick={handleCloneConfirm}>Clone &amp; overwrite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone to dialog */}
      <Dialog open={cloneToOpen} onOpenChange={setCloneToOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Clone to…</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">Select a destination type. The current sections and fields will be copied there, overwriting any existing configuration.</p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Relationship Type</label>
            <select
              value={cloneToType}
              onChange={(e) => setCloneToType(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
            >
              <option value="">Select type…</option>
              {otherTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {cloneToType && (
              <p className="mt-1 text-xs text-amber-600">This will overwrite the config for {cloneToType}.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloneToOpen(false)}>Cancel</Button>
            <Button disabled={!cloneToType} onClick={handleCloneToConfirm}>Clone &amp; overwrite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same as dialog */}
      <Dialog open={sameAsOpen} onOpenChange={setSameAsOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Same as another type</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Link this type to another. It will become read-only and automatically reflect any changes made to the source type.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Relationship Type</label>
            <select
              value={sameAsType}
              onChange={(e) => setSameAsType(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
            >
              <option value="">Select type…</option>
              {otherTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSameAsOpen(false)}>Cancel</Button>
            <Button disabled={!sameAsType} onClick={handleSameAsConfirm}>Set as same as</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {displaySections.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          {linkedTo ? "Source config not found or has no sections." : "No sections yet — use Clone from… or Same as… to copy from another type, or click + Add section."}
        </p>
      )}

      {displaySections.map((section) => (
        <div key={section.id} className={`rounded-lg border bg-white overflow-hidden ${linkedTo ? "border-blue-100 opacity-90" : "border-slate-200"}`}>
          {/* Section header */}
          <div className={`flex items-center gap-2 border-b px-4 py-2 ${linkedTo ? "border-blue-100 bg-blue-50/50" : "border-slate-200 bg-slate-50"}`}>
            {!linkedTo && !isLocked && editingSectionId === section.id ? (
              <Input
                value={editingSectionName}
                onChange={(e) => setEditingSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameSection(section.id, editingSectionName);
                  if (e.key === "Escape") setEditingSectionId(null);
                }}
                onBlur={() => renameSection(section.id, editingSectionName)}
                autoFocus
                className="h-6 text-sm font-medium flex-1 border-slate-300"
              />
            ) : (
              <span
                className={`flex-1 text-sm font-medium text-slate-800 ${!linkedTo && !isLocked ? "cursor-pointer hover:text-[var(--color-blue)]" : ""}`}
                onClick={!linkedTo && !isLocked ? () => { setEditingSectionId(section.id); setEditingSectionName(section.name); } : undefined}
                title={!linkedTo && !isLocked ? "Click to rename" : undefined}
              >
                {section.name}
              </span>
            )}
            {linkedTo && <span className="text-[10px] text-blue-400 italic">read-only</span>}
            {!linkedTo && !isLocked && (
              <button
                onClick={() => removeSection(section.id)}
                className="text-xs text-red-400 hover:text-red-600 ml-1"
              >
                Remove section
              </button>
            )}
          </div>

          {/* Fields header */}
          <div className="grid grid-cols-[1fr_160px_60px] gap-2 px-4 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Field Name</span>
            <span>Salesforce Type</span>
            <span></span>
          </div>

          {/* Fields */}
          <ul className="divide-y divide-slate-100">
            {section.fields.length === 0 && (
              <li className="px-4 py-2 text-xs text-slate-400 italic">No fields yet.</li>
            )}
            {section.fields.map((field) => {
              const picklistKey = `${section.id}|${field.name}`;
              const isPicklist = field.fieldType === "Picklist" || field.fieldType === "Multi-Select";
              return (
                <li key={field.name} className="px-4 py-2 hover:bg-slate-50 group">
                  <div className="grid grid-cols-[1fr_160px_60px] gap-2 items-center text-sm">
                    <span className="text-slate-800">{field.name}</span>
                    <span className="text-xs text-slate-500">{field.fieldType}</span>
                    {!linkedTo && !isLocked && (
                      <button
                        onClick={() => removeField(section.id, field.name)}
                        className="hidden group-hover:block text-xs text-red-400 hover:text-red-600 text-right"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {isPicklist && (
                    <div className="mt-2 ml-4 space-y-1">
                      {(field.picklistValues ?? []).length === 0 && (
                        <p className="text-[10px] text-slate-400 italic">No picklist values yet.</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {(field.picklistValues ?? []).map((v) => (
                          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {v}
                            {!linkedTo && !isLocked && (
                              <button
                                onClick={() => removePicklistValue(section.id, field.name, v)}
                                className="hover:text-red-500 leading-none text-[10px]"
                              >×</button>
                            )}
                          </span>
                        ))}
                      </div>
                      {!linkedTo && !isLocked && (
                        <div className="mt-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => setPicklistPasteMode((prev) => ({ ...prev, [picklistKey]: !prev[picklistKey] }))}
                              className="text-[10px] text-[var(--color-blue)] hover:underline"
                            >
                              {picklistPasteMode[picklistKey] ? "Cancel paste" : "Paste list"}
                            </button>
                          </div>
                          {picklistPasteMode[picklistKey] ? (
                            <div className="space-y-1">
                              <textarea
                                value={picklistPasteText[picklistKey] ?? ""}
                                onChange={(e) => setPicklistPasteText((prev) => ({ ...prev, [picklistKey]: e.target.value }))}
                                placeholder={"One value per line…"}
                                rows={4}
                                autoFocus
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] resize-none"
                              />
                              <Button
                                size="sm"
                                className="h-6 px-2 text-xs w-full"
                                onClick={() => {
                                  const existing = field.picklistValues ?? [];
                                  const lines = (picklistPasteText[picklistKey] ?? "")
                                    .split("\n").map((l) => l.trim()).filter((l) => l && !existing.includes(l));
                                  if (lines.length) {
                                    persist(sections.map((s) => s.id === section.id ? {
                                      ...s,
                                      fields: s.fields.map((f) => f.name === field.name
                                        ? { ...f, picklistValues: [...existing, ...lines] } : f),
                                    } : s));
                                  }
                                  setPicklistPasteText((prev) => ({ ...prev, [picklistKey]: "" }));
                                  setPicklistPasteMode((prev) => ({ ...prev, [picklistKey]: false }));
                                }}
                              >
                                Add {(picklistPasteText[picklistKey] ?? "").split("\n").filter((l) => l.trim() && !(field.picklistValues ?? []).includes(l.trim())).length} value(s)
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1.5">
                              <Input
                                value={newPicklistInputs[picklistKey] ?? ""}
                                onChange={(e) => setNewPicklistInputs((prev) => ({ ...prev, [picklistKey]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const val = (newPicklistInputs[picklistKey] ?? "").trim();
                                    if (val) { addPicklistValue(section.id, field.name, val); setNewPicklistInputs((prev) => ({ ...prev, [picklistKey]: "" })); }
                                  }
                                }}
                                placeholder="Add picklist value…"
                                className="h-6 text-xs"
                              />
                              <Button
                                size="sm"
                                className="h-6 px-2 text-xs shrink-0"
                                onClick={() => {
                                  const val = (newPicklistInputs[picklistKey] ?? "").trim();
                                  if (val) { addPicklistValue(section.id, field.name, val); setNewPicklistInputs((prev) => ({ ...prev, [picklistKey]: "" })); }
                                }}
                              >+ Add</Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Add field */}
          {!linkedTo && !isLocked && (
            <div className="border-t border-slate-100 px-4 py-2 grid grid-cols-[1fr_160px_auto] gap-2 items-center">
              <Input
                value={newFieldInputs[section.id]?.name ?? ""}
                onChange={(e) => setNewFieldInputs((prev) => ({
                  ...prev,
                  [section.id]: { name: e.target.value, fieldType: prev[section.id]?.fieldType ?? "Text(255)" },
                }))}
                onKeyDown={(e) => { if (e.key === "Enter") addField(section.id); }}
                placeholder="Field name…"
                className="h-7 text-xs"
              />
              <select
                value={newFieldInputs[section.id]?.fieldType ?? "Text(255)"}
                onChange={(e) => setNewFieldInputs((prev) => ({
                  ...prev,
                  [section.id]: { name: prev[section.id]?.name ?? "", fieldType: e.target.value },
                }))}
                className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
              >
                {SF_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button size="sm" onClick={() => addField(section.id)} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          )}
        </div>
      ))}

      {/* Add section inline */}
      {!linkedTo && !isLocked && addingSectionOpen && (
        <div className="flex gap-2">
          <Input
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addSection(); if (e.key === "Escape") setAddingSectionOpen(false); }}
            placeholder="Section name…"
            className="text-sm"
            autoFocus
          />
          <Button onClick={addSection}>Add</Button>
          <Button variant="ghost" onClick={() => { setAddingSectionOpen(false); setNewSectionName(""); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

// ── Main Tool ─────────────────────────────────────────────────────────────────

export function RelationshipsTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const stored = useQuery(api.picklists.listForScope, { scope: "relationships" });
  const allFieldConfigs = useQuery(api.relationships.listFieldConfigs, { projectId });
  const setValues = useMutation(api.picklists.setValues);
  const addValue = useMutation(api.picklists.addValue);

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "relationships");

  const userTypes = useMemo(() => stored?.find((r) => r.key === "types")?.values ?? [], [stored]);
  const hiddenSystemTypes = useMemo(() => stored?.find((r) => r.key === "hidden-types")?.values ?? [], [stored]);

  // Visible types: system types (minus hidden) + user-added types
  const typeValues = useMemo(() => {
    const visibleSystem = SYSTEM_TYPES.filter((t) => !hiddenSystemTypes.includes(t));
    return [...visibleSystem, ...userTypes];
  }, [userTypes, hiddenSystemTypes]);

  const defaultMeta: YamlMeta = useMemo(() => ({
    storyId: "REL-CONFIG-001",
    title: `Relationship Types — ${project?.name ?? ""}`,
    featureArea: "relationships",
  }), [project?.name]);

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildRelationshipsYaml(typeValues, meta),
    [typeValues],
  );

  async function handleImportConfirm(rows: RelationshipRow[], mode: ImportMode) {
    const incomingTypes = [...new Set(rows.map((r) => r.type))];
    if (mode === "replace") {
      await setValues({ scope: "relationships", key: "types", values: incomingTypes });
    } else {
      const merged = [...new Set([...typeValues, ...incomingTypes])];
      await setValues({ scope: "relationships", key: "types", values: merged });
    }
    toast.success(`Imported ${incomingTypes.length} relationship type${incomingTypes.length !== 1 ? "s" : ""}`);
  }

  const activeType = selectedType ?? typeValues[0] ?? null;

  if (project === undefined || stored === undefined) {
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
            Relationships, Connections &amp; Contacts — {project.name}
          </h2>
          <p className="text-xs text-slate-500">
            {typeValues.length} {typeValues.length === 1 ? "type" : "types"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManageOpen(true)} disabled={isLocked}>
            Manage Relationship Types
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>
            Import
          </Button>
          <ExportButton
            onExcelClick={() => {
              const resolved: RelationshipFieldConfig[] = (allFieldConfigs ?? []).map((c) => {
                const linked = (c as any).linkedTo;
                if (!linked) return c as RelationshipFieldConfig;
                const source = (allFieldConfigs ?? []).find(
                  (s) => s.relationshipType === linked.relationshipType,
                );
                return {
                  relationshipType: c.relationshipType,
                  sections: (source?.sections ?? []) as RelationshipFieldConfig["sections"],
                };
              });
              const allExportTypes = [...SYSTEM_TYPES, ...userTypes];
              downloadRelationshipsExcel(allExportTypes, resolved, hiddenSystemTypes);
            }}
            onYamlClick={() => setYamlOpen(true)}
          />
        </div>
      </div>

      {/* Type selector */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-6 max-w-xl">
        <div className="mb-2">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-[#1e3a5f] text-white mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
            </svg>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Relationship Type <span className="text-red-500">*</span>
          </label>
          <select
            value={activeType ?? ""}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
          >
            {typeValues.length === 0 && (
              <option value="" disabled>No types configured — use Manage Relationship Types</option>
            )}
            {typeValues.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Field config panel */}
      {activeType && (
        <FieldConfigPanel
          projectId={projectId}
          relationshipType={activeType}
          allTypes={typeValues}
          isLocked={isLocked}
        />
      )}

      <ManageRelationshipTypesDialog open={manageOpen} onOpenChange={setManageOpen} />

      <ImportDialog<RelationshipRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Relationship Types"
        acceptFileTypes=".yaml,.yml,.csv,.xls"
        parseFile={parseRelationshipsFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0 text-sm">
            <span className="font-medium">{r.type}</span>
          </div>
        )}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadRelationshipsYaml(typeValues, meta)}
      />
      </div>
    </div>
  );
}
