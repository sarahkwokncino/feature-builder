"use client";

import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
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
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import {
  buildCollateralYaml,
  downloadCollateralYaml,
  downloadCollateralExcel,
  parseCollateralYaml,
  parseCollateralCsv,
  type CollateralPicklists,
  type CollateralRow,
  type CollateralFieldConfig,
} from "@/lib/export-import";
import { toast } from "sonner";
import {
  COLLATERAL_TYPE_SUBTYPE_MAP,
  COLLATERAL_SUBTYPE_KEY_PREFIX,
} from "@/lib/picklist-defaults";

// ── Manage Collaterals Dialog ─────────────────────────────────────────────────

function ManageCollateralsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const stored = useQuery(api.picklists.listForScope, { scope: "collateral" });
  const addValue = useMutation(api.picklists.addValue);
  const setValues = useMutation(api.picklists.setValues);

  const [activeType, setActiveType] = useState<string | null>(null);
  const [newTypeInput, setNewTypeInput] = useState("");
  const [newSubtypeInputs, setNewSubtypeInputs] = useState<Record<string, string>>({});

  // Types list stored under key "types"
  const typeValues = useMemo(() => {
    const stored_ = stored?.find((r) => r.key === "types");
    return stored_?.values ?? Object.keys(COLLATERAL_TYPE_SUBTYPE_MAP);
  }, [stored]);

  function subtypesForType(type: string): string[] {
    const row = stored?.find((r) => r.key === COLLATERAL_SUBTYPE_KEY_PREFIX + type);
    return row?.values ?? COLLATERAL_TYPE_SUBTYPE_MAP[type] ?? [];
  }

  async function handleAddType() {
    const val = newTypeInput.trim();
    if (!val || typeValues.includes(val)) return;
    await addValue({ scope: "collateral", key: "types", value: val });
    setNewTypeInput("");
    setActiveType(val);
  }

  async function handleRemoveType(type: string) {
    await setValues({ scope: "collateral", key: "types", values: typeValues.filter((t) => t !== type) });
    // Also clear its subtypes
    await setValues({ scope: "collateral", key: COLLATERAL_SUBTYPE_KEY_PREFIX + type, values: [] });
    if (activeType === type) setActiveType(null);
  }

  async function handleAddSubtype(type: string) {
    const val = (newSubtypeInputs[type] ?? "").trim();
    if (!val) return;
    await addValue({ scope: "collateral", key: COLLATERAL_SUBTYPE_KEY_PREFIX + type, value: val });
    setNewSubtypeInputs((prev) => ({ ...prev, [type]: "" }));
  }

  async function handleRemoveSubtype(type: string, subtype: string) {
    const current = subtypesForType(type);
    await setValues({
      scope: "collateral",
      key: COLLATERAL_SUBTYPE_KEY_PREFIX + type,
      values: current.filter((s) => s !== subtype),
    });
  }

  const displayType = activeType ?? typeValues[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Collaterals</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-0 divide-x divide-slate-200 rounded-lg border border-slate-200 overflow-hidden" style={{ height: "min(60vh, 480px)" }}>
          {/* Left: Types */}
          <div className="col-span-2 flex flex-col min-h-0">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Type</p>
            </div>
            <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {typeValues.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-slate-400 italic">No types yet.</li>
              )}
              {typeValues.map((t) => (
                <li
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={`flex items-center justify-between rounded px-2.5 py-1.5 cursor-pointer text-sm group ${
                    t === displayType
                      ? "bg-[var(--color-blue)]/10 text-[var(--color-blue)] font-medium"
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <span>{t}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveType(t); }}
                    className="hidden group-hover:block text-xs text-red-500 hover:text-red-700 ml-1"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 p-2 flex gap-1.5 shrink-0">
              <Input
                value={newTypeInput}
                onChange={(e) => setNewTypeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddType(); }}
                placeholder="New type…"
                className="text-xs h-7"
              />
              <Button size="sm" onClick={handleAddType} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          </div>

          {/* Right: Subtypes for selected type */}
          <div className="col-span-3 flex flex-col min-h-0">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Sub Type{displayType ? ` — ${displayType}` : ""}
              </p>
            </div>
            {!displayType ? (
              <div className="flex-1 flex items-center justify-center p-4 text-xs text-slate-400 italic">
                Select a type to manage its sub types.
              </div>
            ) : (
              <>
                <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {subtypesForType(displayType).length === 0 && (
                    <li className="px-2 py-1.5 text-xs text-slate-400 italic">No sub types yet.</li>
                  )}
                  {subtypesForType(displayType).map((s) => (
                    <li
                      key={s}
                      className="flex items-center justify-between rounded px-2.5 py-1.5 text-sm hover:bg-slate-50 group"
                    >
                      <span>{s}</span>
                      <button
                        onClick={() => handleRemoveSubtype(displayType, s)}
                        className="hidden group-hover:block text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-slate-200 p-2 flex gap-1.5 shrink-0">
                  <Input
                    value={newSubtypeInputs[displayType] ?? ""}
                    onChange={(e) => setNewSubtypeInputs((prev) => ({ ...prev, [displayType]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSubtype(displayType); }}
                    placeholder={`New sub type for ${displayType}…`}
                    className="text-xs h-7"
                  />
                  <Button size="sm" onClick={() => handleAddSubtype(displayType)} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
                </div>
              </>
            )}
          </div>
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
  "Text(255)",
  "Text(100)",
  "Text(512)",
  "Text Area",
  "Text Area (Long)",
  "Date",
  "Date/Time",
  "Number",
  "Currency",
  "Percent",
  "Checkbox",
  "Picklist",
  "Lookup",
  "URL",
  "Email",
  "Phone",
];

const DEFAULT_SECTIONS: Section[] = [
  {
    id: "real-estate-details",
    name: "Current Real Estate Details",
    fields: [
      { name: "Address Line 1", fieldType: "Text(255)" },
      { name: "Address Line 2", fieldType: "Text(255)" },
      { name: "Town/City", fieldType: "Text(255)" },
      { name: "County", fieldType: "Text(255)" },
      { name: "Country", fieldType: "Text(255)" },
      { name: "Region", fieldType: "Text(255)" },
      { name: "Postcode", fieldType: "Text(255)" },
    ],
  },
  {
    id: "real-estate-financials",
    name: "Current Real Estate Financials",
    fields: [
      { name: "Title Number", fieldType: "Text(255)" },
      { name: "Title Registered Date", fieldType: "Date" },
    ],
  },
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Field Config Panel ────────────────────────────────────────────────────────

function FieldConfigPanel({
  projectId,
  collateralType,
  collateralSubtype,
  allTypes,
  subtypesForType,
  isLocked,
}: {
  projectId: Id<"projects">;
  collateralType: string;
  collateralSubtype: string;
  allTypes: string[];
  subtypesForType: (t: string) => string[];
  isLocked: boolean;
}) {
  const saved = useQuery(api.collateral.getFieldConfig, { projectId, collateralType, collateralSubtype });
  const allConfigs = useQuery(api.collateral.listFieldConfigs, { projectId });
  const saveConfig = useMutation(api.collateral.saveFieldConfig);
  const setLinkedTo = useMutation(api.collateral.setLinkedTo);

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
  const [cloneSubtype, setCloneSubtype] = useState("");
  const [cloneToOpen, setCloneToOpen] = useState(false);
  const [cloneToType, setCloneToType] = useState("");
  const [cloneToSubtype, setCloneToSubtype] = useState("");
  const [sameAsOpen, setSameAsOpen] = useState(false);
  const [sameAsType, setSameAsType] = useState("");
  const [sameAsSubtype, setSameAsSubtype] = useState("");

  const linkedTo = saved?.linkedTo ?? null;

  // When linkedTo is set, query the source config
  const sourceConfig = useQuery(
    api.collateral.getFieldConfig,
    linkedTo
      ? { projectId, collateralType: linkedTo.collateralType, collateralSubtype: linkedTo.collateralSubtype }
      : "skip",
  );

  // Resolved sections: if linked, show source sections; otherwise local sections
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

  // Load saved config or fall back to defaults whenever the combo changes
  useEffect(() => {
    if (saved === undefined) return; // still loading
    if (saved?.linkedTo) { setSections(DEFAULT_SECTIONS); return; }
    if (!saved) {
      const isFirst = collateralType === allTypes[0] && collateralSubtype === subtypesForType(allTypes[0])[0];
      persist(isFirst ? DEFAULT_SECTIONS : []);
      return;
    }
    // Migrate old string[] format to Field[] format
    const migrated: Section[] = saved.sections.map((s: any) => ({
      ...s,
      fields: (s.fields as any[]).map((f) =>
        typeof f === "string" ? { name: f, fieldType: "Text(255)" } : f,
      ),
    }));
    setSections(migrated);
  }, [saved, collateralType, collateralSubtype]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(updated: Section[]) {
    setSections(updated);
    await saveConfig({ projectId, collateralType, collateralSubtype, sections: updated, linkedTo: undefined });
  }

  function handleCloneConfirm() {
    if (!cloneType || !cloneSubtype) return;
    const source = allConfigs?.find(
      (c) => c.collateralType === cloneType && c.collateralSubtype === cloneSubtype,
    );
    const sourceSections: Section[] = source
      ? (source.sections as Section[]).map((s) => ({ ...s, id: newId(), fields: s.fields.map((f) => ({ ...f })) }))
      : DEFAULT_SECTIONS;
    persist(sourceSections);
    setCloneOpen(false);
  }

  async function handleCloneToConfirm() {
    if (!cloneToType) return;
    const clonedSections: Section[] = sections.map((s) => ({ ...s, id: newId(), fields: s.fields.map((f) => ({ ...f })) }));
    const targets = cloneToSubtype
      ? [{ type: cloneToType, subtype: cloneToSubtype }]
      : subtypesForType(cloneToType).map((sub) => ({ type: cloneToType, subtype: sub }));
    await Promise.all(
      targets.map(({ type, subtype }) =>
        saveConfig({ projectId, collateralType: type, collateralSubtype: subtype, sections: clonedSections.map((s) => ({ ...s, id: newId(), fields: s.fields.map((f) => ({ ...f })) })), linkedTo: undefined }),
      ),
    );
    setCloneToOpen(false);
  }

  async function handleSameAsConfirm() {
    if (!sameAsType || !sameAsSubtype) return;
    await setLinkedTo({ projectId, collateralType, collateralSubtype, linkedTo: { collateralType: sameAsType, collateralSubtype: sameAsSubtype } });
    setSameAsOpen(false);
  }

  async function handleRemoveLink() {
    await setLinkedTo({ projectId, collateralType, collateralSubtype, linkedTo: undefined });
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
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.name !== fieldName) } : s,
    );
    persist(updated);
  }

  function addPicklistValue(sectionId: string, fieldName: string, value: string) {
    const updated = sections.map((s) =>
      s.id === sectionId ? {
        ...s,
        fields: s.fields.map((f) =>
          f.name === fieldName
            ? { ...f, picklistValues: [...(f.picklistValues ?? []), value] }
            : f,
        ),
      } : s,
    );
    persist(updated);
  }

  function removePicklistValue(sectionId: string, fieldName: string, value: string) {
    const updated = sections.map((s) =>
      s.id === sectionId ? {
        ...s,
        fields: s.fields.map((f) =>
          f.name === fieldName
            ? { ...f, picklistValues: (f.picklistValues ?? []).filter((v) => v !== value) }
            : f,
        ),
      } : s,
    );
    persist(updated);
  }

  function renameSection(sectionId: string, name: string) {
    const updated = sections.map((s) => s.id === sectionId ? { ...s, name } : s);
    persist(updated);
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

  // All other type-subtype combos (excluding current)
  const otherCombos = allTypes.flatMap((t) =>
    subtypesForType(t)
      .filter((s) => !(t === collateralType && s === collateralSubtype))
      .map((s) => ({ type: t, subtype: s })),
  );

  return (
    <div className="mt-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Fields for <span className="text-[var(--color-blue)]">{collateralType} — {collateralSubtype}</span>
        </h3>
        {!linkedTo && !isLocked && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setCloneType(""); setCloneSubtype(""); setCloneOpen(true); }} className="text-xs h-7">
              Clone from…
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setCloneToType(""); setCloneToSubtype(""); setCloneToOpen(true); }} className="text-xs h-7">
              Clone to…
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setSameAsType(""); setSameAsSubtype(""); setSameAsOpen(true); }} className="text-xs h-7">
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
            {linkedTo.collateralType} — {linkedTo.collateralSubtype}
            <span className="ml-2 text-xs text-blue-600">(read-only — changes to the source are automatically reflected here)</span>
          </div>
          {!isLocked && (
            <Button size="sm" variant="outline" onClick={handleRemoveLink} className="text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-100">
              Remove link
            </Button>
          )}
        </div>
      )}

      {/* Clone dialog */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Clone fields from another combo</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">Select a type and sub type to copy its sections and fields as an editable base. This will overwrite the current configuration.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
              <select
                value={cloneType}
                onChange={(e) => { setCloneType(e.target.value); setCloneSubtype(""); }}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
              >
                <option value="">Select type…</option>
                {allTypes.filter((t) => !(t === collateralType)).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {subtypesForType(collateralType).filter((s) => s !== collateralSubtype).length > 0 && (
                  <option value={collateralType}>{collateralType} (same type)</option>
                )}
              </select>
            </div>
            {cloneType && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sub Type</label>
                <select
                  value={cloneSubtype}
                  onChange={(e) => setCloneSubtype(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
                >
                  <option value="">Select sub type…</option>
                  {subtypesForType(cloneType)
                    .filter((s) => !(cloneType === collateralType && s === collateralSubtype))
                    .map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                </select>
              </div>
            )}
            {cloneType && cloneSubtype && !allConfigs?.find((c) => c.collateralType === cloneType && c.collateralSubtype === cloneSubtype) && (
              <p className="text-xs text-amber-600">No saved config for this combo — will clone default sections.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button disabled={!cloneType || !cloneSubtype} onClick={handleCloneConfirm}>
              Clone &amp; overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone to dialog */}
      <Dialog open={cloneToOpen} onOpenChange={setCloneToOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Clone to…</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Select a destination Type, and optionally a Sub Type. If you select only a Type, the current sections and fields will be cloned to <span className="font-medium">all</span> of its sub types. If you select both, only that specific combination will be overwritten.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
              <select
                value={cloneToType}
                onChange={(e) => { setCloneToType(e.target.value); setCloneToSubtype(""); }}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
              >
                <option value="">Select type…</option>
                {allTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {cloneToType && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sub Type <span className="text-slate-400 font-normal">(optional — leave blank to clone to all)</span></label>
                <select
                  value={cloneToSubtype}
                  onChange={(e) => setCloneToSubtype(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
                >
                  <option value="">All sub types</option>
                  {subtypesForType(cloneToType).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            {cloneToType && (
              <p className="text-xs text-amber-600">
                {cloneToSubtype
                  ? `This will overwrite the config for ${cloneToType} — ${cloneToSubtype}.`
                  : `This will overwrite configs for all ${subtypesForType(cloneToType).length} sub type(s) under ${cloneToType}.`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloneToOpen(false)}>Cancel</Button>
            <Button disabled={!cloneToType} onClick={handleCloneToConfirm}>
              Clone &amp; overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same as dialog */}
      <Dialog open={sameAsOpen} onOpenChange={setSameAsOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Same as another combo</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Link this combo to another. It will become read-only and automatically reflect any changes made to the source combo.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
              <select
                value={sameAsType}
                onChange={(e) => { setSameAsType(e.target.value); setSameAsSubtype(""); }}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
              >
                <option value="">Select type…</option>
                {otherCombos
                  .filter((c, i, arr) => arr.findIndex((x) => x.type === c.type) === i)
                  .map(({ type }) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
              </select>
            </div>
            {sameAsType && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sub Type</label>
                <select
                  value={sameAsSubtype}
                  onChange={(e) => setSameAsSubtype(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
                >
                  <option value="">Select sub type…</option>
                  {otherCombos
                    .filter((c) => c.type === sameAsType)
                    .map(({ subtype }) => (
                      <option key={subtype} value={subtype}>{subtype}</option>
                    ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSameAsOpen(false)}>Cancel</Button>
            <Button disabled={!sameAsType || !sameAsSubtype} onClick={handleSameAsConfirm}>
              Set as same as
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {displaySections.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          {linkedTo ? "Source config not found or has no sections." : "No sections yet — use Clone from… or Same as… to copy from another combo, or click + Add section."}
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
            {linkedTo && (
              <span className="text-[10px] text-blue-400 italic">read-only</span>
            )}
            {!linkedTo && !isLocked && (
              <>
                <button
                  onClick={() => removeSection(section.id)}
                  className="text-xs text-red-400 hover:text-red-600 ml-1"
                >
                  Remove section
                </button>
              </>
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
              const isPicklist = field.fieldType === "Picklist";
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

          {/* Add field — hidden when linked or locked */}
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

      {/* Add section inline — hidden when linked or locked */}
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

// ── Preview Playground (read-only, embedded in Stages & UI Builder) ──────────

function CollateralPreviewFields({
  projectId,
  collateralType,
  collateralSubtype,
}: {
  projectId: Id<"projects">;
  collateralType: string;
  collateralSubtype: string;
}) {
  const saved = useQuery(api.collateral.getFieldConfig, { projectId, collateralType, collateralSubtype });
  const linkedTo = saved?.linkedTo ?? null;
  const sourceConfig = useQuery(
    api.collateral.getFieldConfig,
    linkedTo ? { projectId, collateralType: linkedTo.collateralType, collateralSubtype: linkedTo.collateralSubtype } : "skip",
  );

  if (saved === undefined) {
    return <p className="text-xs text-slate-400 italic px-1">Loading…</p>;
  }

  const rawSections = linkedTo ? (sourceConfig?.sections ?? null) : (saved?.sections ?? null);

  const displaySections: Section[] = rawSections
    ? (rawSections as any[]).map((s) => ({
        ...s,
        fields: (s.fields as any[]).map((f) =>
          typeof f === "string" ? { name: f, fieldType: "Text(255)" } : f,
        ),
      }))
    : DEFAULT_SECTIONS;

  return (
    <div className="space-y-3">
      {linkedTo && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.101-1.102" />
          </svg>
          <span><span className="font-medium">Same as:</span> {linkedTo.collateralType} — {linkedTo.collateralSubtype}</span>
        </div>
      )}

      {displaySections.length === 0 && (
        <p className="text-xs text-slate-400 italic">No sections configured for this combination yet.</p>
      )}

      {displaySections.map((section) => (
        <div key={section.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
            <span className="flex-1 text-sm font-medium text-slate-800">{section.name}</span>
            <span className="text-[10px] text-slate-400">{section.fields.length} field{section.fields.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-[1fr_160px] gap-2 px-4 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Field Name</span>
            <span>Salesforce Type</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {section.fields.length === 0 && (
              <li className="px-4 py-2 text-xs text-slate-400 italic">No fields.</li>
            )}
            {section.fields.map((field) => (
              <li key={field.name} className="px-4 py-2">
                <div className="grid grid-cols-[1fr_160px] gap-2 items-center text-sm">
                  <span className="text-slate-800">{field.name}</span>
                  <span className="text-xs text-slate-500">{field.fieldType}</span>
                </div>
                {field.fieldType === "Picklist" && (field.picklistValues ?? []).length > 0 && (
                  <div className="mt-1.5 ml-4 flex flex-wrap gap-1">
                    {(field.picklistValues ?? []).map((v) => (
                      <span key={v} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{v}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type SecurityEntry = { id: string; collateralType: string; collateralSubtype: string };

export function CollateralPreviewPlayground({
  projectId,
  typeValues,
  subtypesForType,
}: {
  projectId: Id<"projects">;
  typeValues: string[];
  subtypesForType: (t: string) => string[];
}) {
  const [entries, setEntries] = useState<SecurityEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingType, setPendingType] = useState<string>(() => typeValues[0] ?? "");
  const [pendingSubtype, setPendingSubtype] = useState<string>(() => subtypesForType(typeValues[0] ?? "")[0] ?? "");

  const pendingSubtypes = pendingType ? subtypesForType(pendingType) : [];

  function handlePendingTypeChange(t: string) {
    setPendingType(t);
    setPendingSubtype(subtypesForType(t)[0] ?? "");
  }

  function handleAdd() {
    if (!pendingType || !pendingSubtype) return;
    const id = Math.random().toString(36).slice(2, 8);
    const entry: SecurityEntry = { id, collateralType: pendingType, collateralSubtype: pendingSubtype };
    setEntries((prev) => [...prev, entry]);
    setActiveId(id);
    setAdding(false);
    setPendingType(typeValues[0] ?? "");
    setPendingSubtype(subtypesForType(typeValues[0] ?? "")[0] ?? "");
  }

  function handleRemove(id: string) {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.id ?? null);
      return next;
    });
  }

  const activeEntry = entries.find((e) => e.id === activeId) ?? null;

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Add securities to see how their configured fields would appear in nCino. Each tab represents one security on the loan.
      </p>

      {typeValues.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No collateral types configured yet. Add them in the Collateral Management Builder.</p>
      ) : (
        <>
          {/* Tab bar */}
          {(entries.length > 0 || adding) && (
            <div className="mb-4 flex items-center gap-0 border-b border-slate-200">
              {entries.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setActiveId(e.id); setAdding(false); }}
                  className={`group relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    activeId === e.id && !adding
                      ? "border-[var(--color-blue)] text-[var(--color-blue)]"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span>{e.collateralType} — {e.collateralSubtype}</span>
                  <span
                    role="button"
                    onClick={(ev) => { ev.stopPropagation(); handleRemove(e.id); }}
                    className="ml-0.5 rounded text-[10px] leading-none text-slate-300 hover:text-red-400"
                    title="Remove"
                  >✕</span>
                </button>
              ))}
              {adding && (
                <div className="border-b-2 border-[var(--color-blue)] -mb-px px-3 py-2 text-xs font-medium text-[var(--color-blue)]">
                  New security…
                </div>
              )}
            </div>
          )}

          {/* Add security picker */}
          {adding ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-3 text-xs font-semibold text-slate-600">Choose type and sub type for this security</p>
              <div className="grid grid-cols-2 gap-3 max-w-lg">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Type</label>
                  <select
                    value={pendingType}
                    onChange={(e) => handlePendingTypeChange(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
                  >
                    {typeValues.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Sub Type</label>
                  <select
                    value={pendingSubtype}
                    onChange={(e) => setPendingSubtype(e.target.value)}
                    disabled={pendingSubtypes.length === 0}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {pendingSubtypes.length === 0
                      ? <option value="" disabled>No sub types</option>
                      : pendingSubtypes.map((s) => <option key={s} value={s}>{s}</option>)
                    }
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!pendingType || !pendingSubtype}
                  className="rounded bg-[var(--color-blue)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  Add Security
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="rounded px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setAdding(true); setPendingType(typeValues[0] ?? ""); setPendingSubtype(subtypesForType(typeValues[0] ?? "")[0] ?? ""); }}
              className="mb-4 flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:border-[var(--color-blue)] hover:text-[var(--color-blue)] transition-colors"
            >
              <span className="text-base leading-none">+</span> Add Security
            </button>
          )}

          {/* Active entry fields */}
          {activeEntry && !adding && (
            <CollateralPreviewFields
              projectId={projectId}
              collateralType={activeEntry.collateralType}
              collateralSubtype={activeEntry.collateralSubtype}
            />
          )}

          {entries.length === 0 && !adding && (
            <p className="text-xs text-slate-400 italic">No securities added yet — click Add Security above.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Tool ─────────────────────────────────────────────────────────────────

export function CollateralTool({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const project = useQuery(api.projects.get, { id: projectId });
  const stored = useQuery(api.picklists.listForScope, { scope: "collateral" });
  const allFieldConfigs = useQuery(api.collateral.listFieldConfigs, { projectId });

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "collateral");

  const setValues = useMutation(api.picklists.setValues);

  const typeValues = useMemo(() => {
    const row = stored?.find((r) => r.key === "types");
    return row?.values ?? Object.keys(COLLATERAL_TYPE_SUBTYPE_MAP);
  }, [stored]);

  function subtypesForType(type: string): string[] {
    const row = stored?.find((r) => r.key === COLLATERAL_SUBTYPE_KEY_PREFIX + type);
    return row?.values ?? COLLATERAL_TYPE_SUBTYPE_MAP[type] ?? [];
  }

  const collateralPicklists = useMemo<CollateralPicklists>(() => {
    const subtypesByType: Record<string, string[]> = {};
    for (const t of typeValues) {
      subtypesByType[t] = subtypesForType(t);
    }
    return { types: typeValues, subtypesByType };
  }, [typeValues, stored]);

  const defaultMeta: YamlMeta = useMemo(() => ({
    storyId: "COL-CONFIG-001",
    title: `Collateral Types — ${project?.name ?? ""}`,
    featureArea: "collateral",
  }), [project?.name]);

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildCollateralYaml(collateralPicklists, meta),
    [collateralPicklists],
  );

  function parseImportFile(text: string, filename: string): CollateralRow[] | string {
    if (filename.endsWith(".yaml") || filename.endsWith(".yml")) return parseCollateralYaml(text);
    return parseCollateralCsv(text);
  }

  async function handleImportConfirm(rows: CollateralRow[], mode: ImportMode) {
    // Group rows into types → subtypes
    const grouped: Record<string, string[]> = {};
    for (const { type, subtype } of rows) {
      if (!grouped[type]) grouped[type] = [];
      if (!grouped[type].includes(subtype)) grouped[type].push(subtype);
    }
    const incomingTypes = Object.keys(grouped);

    if (mode === "replace") {
      // Clear all existing types and subtypes
      await setValues({ scope: "collateral", key: "types", values: incomingTypes });
      for (const type of incomingTypes) {
        await setValues({ scope: "collateral", key: COLLATERAL_SUBTYPE_KEY_PREFIX + type, values: grouped[type] });
      }
    } else {
      // Append: merge types list
      const mergedTypes = [...new Set([...typeValues, ...incomingTypes])];
      await setValues({ scope: "collateral", key: "types", values: mergedTypes });
      for (const type of incomingTypes) {
        const existing = subtypesForType(type);
        const merged = [...new Set([...existing, ...grouped[type]])];
        await setValues({ scope: "collateral", key: COLLATERAL_SUBTYPE_KEY_PREFIX + type, values: merged });
      }
    }
    toast.success(`Imported ${rows.length} collateral row${rows.length !== 1 ? "s" : ""}`);
  }

  const activeType = selectedType ?? typeValues[0] ?? null;
  const activeSubtypes = activeType ? subtypesForType(activeType) : [];

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
            Collateral Management — {project.name}
          </h2>
          <p className="text-xs text-slate-500">
            {typeValues.length} {typeValues.length === 1 ? "type" : "types"} ·{" "}
            {typeValues.reduce((acc, t) => acc + subtypesForType(t).length, 0)} sub types
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManageOpen(true)} disabled={isLocked}>
            Manage Collaterals
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>
            Import
          </Button>
          <Button variant="outline" onClick={() => {
            // Resolve "Same as" links before exporting
            const resolved: CollateralFieldConfig[] = (allFieldConfigs ?? []).map((c) => {
              const linked = (c as any).linkedTo;
              if (!linked) return c as CollateralFieldConfig;
              const source = (allFieldConfigs ?? []).find(
                (s) => s.collateralType === linked.collateralType && s.collateralSubtype === linked.collateralSubtype,
              );
              return {
                collateralType: c.collateralType,
                collateralSubtype: c.collateralSubtype,
                sections: (source?.sections ?? []) as CollateralFieldConfig["sections"],
              };
            });
            downloadCollateralExcel(collateralPicklists, resolved);
          }}>
            Export Excel
          </Button>
          <Button variant="outline" onClick={() => setYamlOpen(true)}>
            Export YAML
          </Button>
        </div>
      </div>

      {/* Preview — mimics the nCino collateral form */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-6 max-w-3xl">
        {/* House icon */}
        <div className="mb-4">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded bg-[#1e3a5f] text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
            </svg>
          </div>
        </div>

        {/* Type dropdown */}
        <div className="mb-5">
          <label className="block text-sm text-slate-700 mb-1">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={activeType ?? ""}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setSelectedSubtype(null);
            }}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
          >
            {typeValues.length === 0 && (
              <option value="" disabled>No types configured — use Manage Collaterals</option>
            )}
            {typeValues.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Sub Type dropdown */}
        <div>
          <label className="block text-sm text-slate-700 mb-1">
            Sub Type <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedSubtype ?? (activeSubtypes[0] ?? "")}
            disabled={!activeType || activeSubtypes.length === 0}
            onChange={(e) => setSelectedSubtype(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)] disabled:bg-slate-50 disabled:text-slate-400"
          >
            {(!activeType || activeSubtypes.length === 0) ? (
              <option value="" disabled>
                {!activeType ? "Select a type first" : "No sub types configured"}
              </option>
            ) : (
              activeSubtypes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Field config panel — shown when both type and subtype are selected */}
      {activeType && (selectedSubtype ?? activeSubtypes[0]) && (
        <FieldConfigPanel
          projectId={projectId}
          collateralType={activeType}
          collateralSubtype={selectedSubtype ?? activeSubtypes[0]}
          allTypes={typeValues}
          subtypesForType={subtypesForType}
          isLocked={isLocked}
        />
      )}

      <ManageCollateralsDialog open={manageOpen} onOpenChange={setManageOpen} />

      <ImportDialog<CollateralRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Collateral Types"
        acceptFileTypes=".yaml,.yml,.csv,.xls"
        parseFile={parseImportFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0 text-sm">
            <span className="font-medium">{r.type}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="text-slate-600">{r.subtype}</span>
          </div>
        )}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadCollateralYaml(collateralPicklists, meta)}
      />
      </div>
    </div>
  );
}
