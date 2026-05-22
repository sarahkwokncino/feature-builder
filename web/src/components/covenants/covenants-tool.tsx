"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { CovenantDialog } from "./covenant-dialog";
import { PicklistEditor } from "./picklist-editor";
import {
  COVENANT_PICKLISTS,
  COVENANT_PICKLIST_LABELS,
} from "@/lib/picklist-defaults";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import {
  buildCovenantsYaml,
  downloadCovenantsYaml,
  downloadCovenantsCsv,
  parseCovenantsYaml,
  parseCovenantsCSv,
  type CovenantRecord,
} from "@/lib/export-import";
import { toast } from "sonner";

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
  const [picklistOpen, setPicklistOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const covenantRows = useMemo<CovenantRecord[]>(
    () =>
      (records ?? []).map((r) => ({
        name: r.name,
        category: r.category,
        type: r.type,
        frequency: r.frequency,
        financialIndicator: r.financialIndicator,
        description: r.description,
      })),
    [records],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildCovenantsYaml(covenantRows, meta),
    [covenantRows],
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

  if (!cardId) {
    return (
      <div className="p-8 text-sm text-slate-600">
        This page expects a <code>?cardId=…</code> query parameter — open it
        from a covenant card in the heatmap.
      </div>
    );
  }

  if (project === undefined || records === undefined) {
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
    <div className="p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Covenant Types — {project.name}
          </h2>
          <p className="text-xs text-slate-500">
            {records.length} {records.length === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPicklistOpen(true)}>
            Manage picklists
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadCovenantsCsv(covenantRows)}
            disabled={records.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => setYamlOpen(true)}
            disabled={records.length === 0}
          >
            Export YAML
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            + Create Covenant
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Auto #</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">Financial Indicator</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No covenants yet. Click <strong>+ Create Covenant</strong> to
                  add one.
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr
                  key={rec._id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {rec.autoNum}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setEditing(rec)}
                      className="text-[var(--color-blue)] hover:underline"
                    >
                      {rec.name || "—"}
                    </button>
                  </td>
                  <td className="px-3 py-2">{rec.category || "—"}</td>
                  <td className="px-3 py-2">{rec.type || "—"}</td>
                  <td className="px-3 py-2">{rec.frequency || "—"}</td>
                  <td className="px-3 py-2">{rec.financialIndicator || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing(rec)}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>{" "}
                    ·{" "}
                    <button
                      onClick={() => handleDelete(rec)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CovenantDialog
        cardId={cardId}
        record={editing}
        open={!!editing || createOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreateOpen(false);
          }
        }}
        picklistMap={picklistMap}
      />

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
        onDownload={(meta) => downloadCovenantsYaml(covenantRows, meta)}
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
    </div>
  );
}
