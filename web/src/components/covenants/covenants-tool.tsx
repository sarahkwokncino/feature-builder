"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CovenantDialog } from "./covenant-dialog";
import { PicklistEditor } from "./picklist-editor";
import {
  COVENANT_PICKLISTS,
  COVENANT_PICKLIST_LABELS,
} from "@/lib/picklist-defaults";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import { ExportButton } from "@/components/ui/export-button";
import {
  buildCovenantsYaml,
  downloadCovenantsYaml,
  downloadCovenantsExcel,
  parseCovenantsYaml,
  parseCovenantsCSv,
  type CovenantRecord,
  type CovenantPicklists,
} from "@/lib/export-import";
import {
  COVENANT_CATEGORY_TYPE_MAP,
  COV_TYPE_KEY_PREFIX,
} from "@/lib/picklist-defaults";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";
import {
  HelpDialog,
  HelpSection,
  HelpBullets,
  HelpTip,
  HelpTable,
  HelpScreenshot,
} from "@/components/ui/help-dialog";

type PreviewCovenant = {
  id: string;
  autoNum: number;
  category: string;
  type: string;
  frequency: string;
  description: string;
  effectiveDate: string;
  graceDays: string;
};

function PreviewCovenantDialog({
  open,
  onOpenChange,
  record,
  onSave,
  picklistMap,
  categoryTypeMap,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: PreviewCovenant | null;
  onSave: (data: Omit<PreviewCovenant, "id" | "autoNum">) => void;
  picklistMap: Map<string, string[]>;
  categoryTypeMap: Record<string, string[]>;
}) {
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [frequency, setFrequency] = useState("");
  const [description, setDescription] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [graceDays, setGraceDays] = useState("");

  useEffect(() => {
    if (record) {
      setCategory(record.category);
      setType(record.type);
      setFrequency(record.frequency);
      setDescription(record.description);
      setEffectiveDate(record.effectiveDate);
      setGraceDays(record.graceDays);
    } else if (open) {
      setCategory(""); setType(""); setFrequency("");
      setDescription(""); setEffectiveDate(""); setGraceDays("");
    }
  }, [record, open]);

  const categoryOptions = picklistMap.get("category") ?? [];
  const frequencyOptions = picklistMap.get("frequency") ?? [];
  const typeOptions = category ? (categoryTypeMap[category] ?? []) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? "Edit covenant" : "Create new covenant"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pcov-category">Category</Label>
              <Select value={category || null} onValueChange={(v: string | null) => { setCategory(v ?? ""); setType(""); }}>
                <SelectTrigger id="pcov-category" className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>—</SelectItem>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pcov-type">Covenant Type</Label>
              <Select value={type || null} onValueChange={(v: string | null) => setType(v ?? "")} disabled={!category}>
                <SelectTrigger id="pcov-type" className="w-full"><SelectValue placeholder={category ? "Select…" : "Pick a category first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>—</SelectItem>
                  {typeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="pcov-freq">Frequency Template</Label>
            <Select value={frequency || null} onValueChange={(v: string | null) => setFrequency(v ?? "")}>
              <SelectTrigger id="pcov-freq" className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>—</SelectItem>
                {frequencyOptions.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pcov-date">Effective Date</Label>
              <Input id="pcov-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pcov-grace">Grace Days</Label>
              <Input id="pcov-grace" type="number" min={0} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave({ category, type, frequency, description, effectiveDate, graceDays }); onOpenChange(false); }}>
            {record ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CovenantsPreviewPlayground({ projectId }: { projectId: Id<"projects"> }) {
  const storedPicklists = useQuery(api.picklists.listForScope, { scope: "covenants" });

  const picklistMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of Object.keys(COVENANT_PICKLISTS)) m.set(k, COVENANT_PICKLISTS[k]);
    if (storedPicklists) for (const p of storedPicklists) m.set(p.key, p.values);
    return m;
  }, [storedPicklists]);

  const categoryTypeMap = useMemo<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = { ...COVENANT_CATEGORY_TYPE_MAP };
    if (storedPicklists) {
      for (const row of storedPicklists) {
        if (row.key.startsWith(COV_TYPE_KEY_PREFIX))
          m[row.key.slice(COV_TYPE_KEY_PREFIX.length)] = row.values;
      }
    }
    return m;
  }, [storedPicklists]);

  const [records, setRecords] = useState<PreviewCovenant[]>([]);
  const [editing, setEditing] = useState<PreviewCovenant | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function handleSave(data: Omit<PreviewCovenant, "id" | "autoNum">) {
    if (editing) {
      setRecords((prev) => prev.map((r) => r.id === editing.id ? { ...editing, ...data } : r));
      setEditing(null);
    } else {
      setRecords((prev) => [...prev, { id: Math.random().toString(36).slice(2, 8), autoNum: prev.length + 1, ...data }]);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Reflects your <span className="font-medium">Covenant Type Builder</span> picklist config.
        </span>
        <Button
          onClick={() => setCreateOpen(true)}
          className="ml-auto bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
        >
          + Create Covenant
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Auto #</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No covenants yet — click <strong>+ Create Covenant</strong> to add one.
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr key={rec.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{rec.autoNum}</td>
                  <td className="px-3 py-2">{rec.category || "—"}</td>
                  <td className="px-3 py-2">{rec.type || "—"}</td>
                  <td className="px-3 py-2">{rec.frequency || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => { setEditing(rec); setCreateOpen(true); }} className="text-xs text-slate-600 hover:text-slate-900">Edit</button>
                    {" · "}
                    <button onClick={() => setRecords((prev) => prev.filter((r) => r.id !== rec.id))} className="text-xs text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PreviewCovenantDialog
        open={createOpen}
        onOpenChange={(o) => { if (!o) { setEditing(null); setCreateOpen(false); } }}
        record={editing}
        onSave={handleSave}
        picklistMap={picklistMap}
        categoryTypeMap={categoryTypeMap}
      />
    </div>
  );
}

export function CovenantsTool({
  projectId,
  cardId,
}: {
  projectId: Id<"projects">;
  cardId?: Id<"cards">;
}) {
  const project = useQuery(api.projects.get, { id: projectId });
  const records = useQuery(
    api.covenants.listForCard,
    cardId ? { cardId } : "skip",
  );
  const removeRecord = useMutation(api.covenants.remove);
  const bulkImport = useMutation(api.covenants.bulkImport);

  const [editing, setEditing] = useState<Doc<"covenants"> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewRecords, setPreviewRecords] = useState<PreviewCovenant[]>([]);
  const [previewEditing, setPreviewEditing] = useState<PreviewCovenant | null>(null);
  const [previewCreateOpen, setPreviewCreateOpen] = useState(false);
  const [picklistOpen, setPicklistOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "covenants");


  const storedPicklists = useQuery(api.picklists.listForScope, {
    scope: "covenants",
  });
  const picklistMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of Object.keys(COVENANT_PICKLISTS)) {
      m.set(k, COVENANT_PICKLISTS[k]);
    }
    if (storedPicklists) {
      for (const p of storedPicklists) m.set(p.key, p.values);
    }
    return m;
  }, [storedPicklists]);

  const defaultMeta: YamlMeta = useMemo(
    () => ({
      storyId: "COV-CONFIG-001",
      title: `Covenant Types — ${project?.name ?? ""}`,
      featureArea: "covenants",
    }),
    [project?.name],
  );

  const covenantPicklists = useMemo<CovenantPicklists>(() => {
    const categories = picklistMap.get("category") ?? [];
    const frequencies = picklistMap.get("frequency") ?? [];
    const covenantTypesByCategory: Record<string, string[]> = {};
    for (const cat of categories) {
      const stored = storedPicklists?.find((p) => p.key === `${COV_TYPE_KEY_PREFIX}${cat}`);
      covenantTypesByCategory[cat] = stored?.values ?? COVENANT_CATEGORY_TYPE_MAP[cat] ?? [];
    }
    return { categories, covenantTypesByCategory, frequencies };
  }, [picklistMap, storedPicklists]);

  const categoryTypeMap = useMemo<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = { ...COVENANT_CATEGORY_TYPE_MAP };
    if (storedPicklists) {
      for (const row of storedPicklists) {
        if (row.key.startsWith(COV_TYPE_KEY_PREFIX)) {
          m[row.key.slice(COV_TYPE_KEY_PREFIX.length)] = row.values;
        }
      }
    }
    return m;
  }, [storedPicklists]);

  function handlePreviewSave(data: Omit<PreviewCovenant, "id" | "autoNum">) {
    if (previewEditing) {
      setPreviewRecords((prev) => prev.map((r) => r.id === previewEditing.id ? { ...previewEditing, ...data } : r));
      setPreviewEditing(null);
    } else {
      const autoNum = previewRecords.length + 1;
      setPreviewRecords((prev) => [...prev, { id: Math.random().toString(36).slice(2, 8), autoNum, ...data }]);
    }
  }

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildCovenantsYaml(covenantPicklists, meta),
    [covenantPicklists],
  );

  function parseImportFile(text: string, filename: string): CovenantRecord[] | string {
    if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
      return parseCovenantsYaml(text);
    }
    return parseCovenantsCSv(text);
  }

  async function handleImportConfirm(rows: CovenantRecord[], mode: ImportMode) {
    if (!cardId) return;
    await bulkImport({ cardId, mode, records: rows });
    toast.success(`Imported ${rows.length} covenant${rows.length !== 1 ? "s" : ""}`);
  }

  if (project === undefined || (cardId && records === undefined)) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  async function handleDelete(rec: Doc<"covenants">) {
    if (!confirm(`Delete covenant "${rec.name || rec.autoNum}"?`)) return;
    await removeRecord({ id: rec._id });
  }

  return (
    <div className="pb-6">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Covenant Types — {project.name}
          </h2>
          {cardId && records !== undefined && (
            <p className="text-xs text-slate-500">
              {records.length} {records.length === 1 ? "item" : "items"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPicklistOpen(true)} disabled={isLocked}>
            Manage picklists
          </Button>
          {cardId && (
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>
              Import
            </Button>
          )}
          <ExportButton
            onExcelClick={() => downloadCovenantsExcel(covenantPicklists)}
            onYamlClick={() => setYamlOpen(true)}
          />
          <Button variant="outline" onClick={() => setHelpOpen(true)}>? Help</Button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">Click <button onClick={() => setPicklistOpen(true)} className="text-[var(--color-blue)] hover:underline">Manage picklists</button> to configure values.</span>
        <Button
          onClick={() => cardId ? setCreateOpen(true) : setPreviewCreateOpen(true)}
          disabled={isLocked}
          className="ml-auto bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
        >
          + Create Covenant
        </Button>
      </div>

      {/* Per-card saved covenants table */}
      {cardId && records !== undefined && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Auto #</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No covenants yet. Click <strong>+ Create Covenant</strong> to add one.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec._id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{rec.autoNum}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setEditing(rec)} className="text-[var(--color-blue)] hover:underline">
                        {rec.name || "—"}
                      </button>
                    </td>
                    <td className="px-3 py-2">{rec.category || "—"}</td>
                    <td className="px-3 py-2">{rec.type || "—"}</td>
                    <td className="px-3 py-2">{rec.frequency || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setEditing(rec)} className="text-xs text-slate-600 hover:text-slate-900">Edit</button>
                      {" · "}
                      <button onClick={() => handleDelete(rec)} className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview-only covenants table (no cardId) */}
      {!cardId && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Auto #</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {previewRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No covenants yet. Click <strong>+ Create Covenant</strong> to add one.
                  </td>
                </tr>
              ) : (
                previewRecords.map((rec) => (
                  <tr key={rec.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{rec.autoNum}</td>
                    <td className="px-3 py-2">{rec.category || "—"}</td>
                    <td className="px-3 py-2">{rec.type || "—"}</td>
                    <td className="px-3 py-2">{rec.frequency || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { setPreviewEditing(rec); setPreviewCreateOpen(true); }} className="text-xs text-slate-600 hover:text-slate-900">Edit</button>
                      {" · "}
                      <button onClick={() => setPreviewRecords((prev) => prev.filter((r) => r.id !== rec.id))} className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {cardId && (
        <CovenantDialog
          cardId={cardId}
          record={editing}
          open={!!editing || createOpen}
          onOpenChange={(o) => { if (!o) { setEditing(null); setCreateOpen(false); } }}
          picklistMap={picklistMap}
        />
      )}

      {!cardId && (
        <PreviewCovenantDialog
          open={previewCreateOpen}
          onOpenChange={(o) => { if (!o) { setPreviewEditing(null); setPreviewCreateOpen(false); } }}
          record={previewEditing}
          onSave={handlePreviewSave}
          picklistMap={picklistMap}
          categoryTypeMap={categoryTypeMap}
        />
      )}

      <PicklistEditor
        open={picklistOpen}
        onOpenChange={setPicklistOpen}
        scope="covenants"
        labels={COVENANT_PICKLIST_LABELS}
        defaults={COVENANT_PICKLISTS}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadCovenantsYaml(covenantPicklists, meta)}
      />

      <ImportDialog<CovenantRecord>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Covenant Types"
        acceptFileTypes=".yaml,.yml,.csv"
        parseFile={parseImportFile}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0">
            <span className="font-medium">{r.name}</span>
            {r.category && (
              <span className="ml-2 text-xs text-slate-500">{r.category}</span>
            )}
          </div>
        )}
      />

      <CovenantsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </div>
  );
}

function CovenantsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <HelpDialog open={open} onOpenChange={onOpenChange} title="Covenant Type Builder — Help">
      <HelpSection title="What are Covenants?">
        <p>Covenants are ongoing obligations placed on a borrower as a condition of a loan — for example, providing periodic financial statements or maintaining a minimum cash balance. They are tracked against the loan and relationships in nCino with a monitoring schedule.</p>
      </HelpSection>

      <HelpScreenshot src="/help-covenants-loan.png" alt="Covenants on a loan record" caption="Covenants panel on a loan record in nCino" />

      <HelpSection title="What does this builder configure?">
        <p>This builder defines the <strong>picklist values</strong> that appear when creating a covenant on a loan. You are configuring the available options — not creating individual covenant records.</p>
        <HelpTable rows={[
          ["Category", "Top-level grouping of covenants (e.g. Financial, Legal). Controls which Types are available."],
          ["Covenant Type", "The specific obligation within a category. Each Category has its own Type list."],
          ["Frequency Template", "How often compliance is due (e.g. Monthly, Quarterly, Annually)."],
          ["Grace Days", "Days after the due date before a covenant is considered overdue."],
        ]} />
      </HelpSection>

      <HelpSection title="How to use this builder">
        <p><strong>Manage picklists</strong> — opens the picklist editor where you add/edit/remove values for Category, Frequency, and Covenant Types per category. Use the tabs at the top to switch between picklist types. Category/Type is hierarchical: adding a Category creates a linked Type tab for that category.</p>
        <p><strong>Import</strong> — import covenant records from a previous YAML or CSV export to pre-populate the preview playground.</p>
        <p><strong>Export</strong> — downloads your configured picklist values as Excel or YAML for use in nCino configuration.</p>
      </HelpSection>

      <HelpScreenshot src="/help-covenants-create.png" alt="Create covenant dialog" caption="Create Covenant dialog — uses the picklists you configure here" />

      <HelpSection title="Preview Playground">
        <p>The preview table below the picklist configuration is a <strong>sandbox only</strong> — it is not saved or exported. Use it to test how your Category / Type combinations look when creating a covenant on a real loan.</p>
      </HelpSection>

      <HelpTip>In nCino, configure covenants under <strong>nCino Admin &gt; Covenants</strong>. The picklist values you configure here map directly to the Category and Type fields on the Covenant record.</HelpTip>
    </HelpDialog>
  );
}
