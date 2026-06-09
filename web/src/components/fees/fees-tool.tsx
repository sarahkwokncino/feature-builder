"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import {
  buildFeesYaml,
  downloadFeesYaml,
  downloadFeesExcel,
  parseFeesFile,
  type FeeRecord,
} from "@/lib/export-import";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { FEES_PICKLISTS } from "@/lib/picklist-defaults";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";

export function FeesTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const records = useQuery(api.fees.listForProject, { projectId });
  const create = useMutation(api.fees.create);
  const remove = useMutation(api.fees.remove);
  const hierarchy = useQuery(api.productHierarchy.listForProject, { projectId });

  const update = useMutation(api.fees.update);
  const bulkImport = useMutation(api.fees.bulkImport);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "fees");

  const [selectedId, setSelectedId] = useState<Id<"fees"> | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"configure" | "matrix">("configure");

  // Derive ProductLine-ProductType-Product strings from the product hierarchy
  const allProducts = useMemo(() => {
    if (!hierarchy) return [];
    const { lines, types, products } = hierarchy;
    return products
      .map((p) => {
        const type = types.find((t) => t._id === p.productTypeId);
        const line = lines.find((l) => l._id === p.productLineId);
        if (!type || !line) return null;
        return `${line.name}-${type.name}-${p.name}`;
      })
      .filter((s): s is string => s !== null);
  }, [hierarchy]);

  async function handleMatrixToggle(fee: Doc<"fees">, product: string) {
    const current = fee.appliedToProducts ?? [];
    const next = current.includes(product)
      ? current.filter((p) => p !== product)
      : [...current, product];
    await update({ id: fee._id, appliedToProducts: next });
  }

  useEffect(() => {
    if (detailPanelRef.current) detailPanelRef.current.scrollTop = 0;
  }, [selectedId]);

  // Keep selectedId pointing at a valid record
  useEffect(() => {
    if (!records) return;
    if (!selectedId && records.length > 0) {
      setSelectedId(records[0]._id);
    }
    if (selectedId && !records.find((r) => r._id === selectedId)) {
      setSelectedId(records[0]?._id ?? null);
    }
  }, [records, selectedId]);

  const exportRows = useMemo<FeeRecord[]>(
    () =>
      (records ?? []).map((r) => ({
        name: r.name,
        feePaidBy: r.feePaidBy,
        calculationType: r.calculationType,
        basisSource: r.basisSource,
        percentage: r.percentage,
        amount: r.amount,
        collectionMethod: r.collectionMethod,
        autoApply: r.autoApply,
        appliedToProducts: r.appliedToProducts,
        notes: r.notes,
      })),
    [records],
  );

  const defaultMeta: YamlMeta = useMemo(
    () => ({
      storyId: "FEE-CONFIG-001",
      title: `Fees — ${project?.name ?? ""}`,
      featureArea: "fees",
    }),
    [project?.name],
  );

  const buildPreview = useCallback(
    (meta: YamlMeta) => buildFeesYaml(exportRows, meta),
    [exportRows],
  );

  if (project === undefined || records === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  async function handleImportConfirm(rows: FeeRecord[], mode: ImportMode) {
    await bulkImport({ projectId, mode, records: rows });
    toast.success(`Imported ${rows.length} fee${rows.length !== 1 ? "s" : ""}`);
  }

  async function handleAdd() {
    const id = await create({ projectId, name: "Untitled Fee" });
    setSelectedId(id);
    toast.success("Fee added");
  }

  async function handleDelete(id: Id<"fees">) {
    if (!confirm("Delete this fee?")) return;
    await remove({ id });
    toast.success("Fee deleted");
  }

  const selected = records.find((r) => r._id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Fees Builder — {project.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>
            Import
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadFeesExcel(exportRows)}
            disabled={records.length === 0}
          >
            Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => setYamlOpen(true)}
            disabled={records.length === 0}
          >
            Export YAML
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isLocked}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            + Add Fee
          </Button>
        </div>
      </div>

      {/* Products source info */}
      <p className="mb-3 text-xs text-slate-500">
        Products are sourced from the{" "}
        <a
          href={`/projects/${projectId}/product-hierarchy`}
          className="font-medium text-[var(--color-blue)] hover:underline"
        >
          Product Hierarchy Builder
        </a>
        . Add or edit products there to update the list here.
      </p>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(["configure", "matrix"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[var(--color-blue)] text-[var(--color-blue)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab === "configure" ? "Configure" : "Product Matrix"}
          </button>
        ))}
      </div>

      {/* Matrix view */}
      {activeTab === "matrix" && (
        <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {records.length === 0 || allProducts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {records.length === 0
                ? "No fees configured yet. Add fees in the Configure tab."
                : "No products found. Add products in the Product Hierarchy Builder first."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-left text-xs font-semibold text-slate-500 min-w-[180px]">
                    Fee
                  </th>
                  <th className="sticky left-[180px] z-10 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-500 min-w-[60px] border-r border-slate-200" />
                  {allProducts.map((prod) => {
                    const allChecked = records.every((f) => (f.appliedToProducts ?? []).includes(prod));
                    const someChecked = records.some((f) => (f.appliedToProducts ?? []).includes(prod));
                    return (
                      <th
                        key={prod}
                        className="px-3 py-2 text-center text-xs font-medium text-slate-600 min-w-[120px] max-w-[160px]"
                      >
                        <div className="break-words">{prod}</div>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          disabled={isLocked}
                          ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                          onChange={async () => {
                            for (const fee of records) {
                              const current = fee.appliedToProducts ?? [];
                              const next = allChecked
                                ? current.filter((p) => p !== prod)
                                : current.includes(prod) ? current : [...current, prod];
                              if (next.length !== current.length || next.some((p, i) => p !== current[i])) {
                                await update({ id: fee._id, appliedToProducts: next });
                              }
                            }
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-50"
                          title={allChecked ? `Deselect all for ${prod}` : `Select all for ${prod}`}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((fee) => {
                  const applied = fee.appliedToProducts ?? [];
                  const rowAllChecked = allProducts.every((p) => applied.includes(p));
                  const rowSomeChecked = allProducts.some((p) => applied.includes(p));
                  return (
                  <tr key={fee._id} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-50">
                      <div>{fee.name.trim() || <span className="italic text-slate-400">Untitled</span>}</div>
                      {fee.calculationType && (
                        <div className="text-xs text-slate-400">
                          {fee.calculationType === "Percentage" && fee.percentage !== undefined
                            ? `${fee.percentage}%`
                            : fee.calculationType === "Flat Amount" && fee.amount !== undefined
                            ? `£${fee.amount.toLocaleString()}`
                            : fee.calculationType}
                        </div>
                      )}
                    </td>
                    <td className="sticky left-[180px] z-10 bg-white px-3 py-2 text-center border-r border-slate-200 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={rowAllChecked}
                        disabled={isLocked}
                        ref={(el) => { if (el) el.indeterminate = rowSomeChecked && !rowAllChecked; }}
                        onChange={() => {
                          const next = rowAllChecked ? [] : [...allProducts];
                          update({ id: fee._id, appliedToProducts: next });
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-50"
                        title={rowAllChecked ? `Deselect all products for ${fee.name}` : `Select all products for ${fee.name}`}
                      />
                    </td>
                    {allProducts.map((prod) => {
                      const checked = applied.includes(prod);
                      return (
                        <td key={prod} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isLocked}
                            onChange={() => handleMatrixToggle(fee, prod)}
                            className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-50"
                            title={`${checked ? "Remove" : "Apply"} ${fee.name} → ${prod}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Configure view */}
      {activeTab === "configure" && (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left: fee list */}
        <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {records.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No fees yet. Click &ldquo;+ Add Fee&rdquo; to start.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {records.map((fee) => (
                <li
                  key={fee._id}
                  className={`flex items-start gap-2 px-3 py-2 hover:bg-slate-50 ${
                    fee._id === selectedId ? "bg-[var(--color-blue)]/10" : ""
                  }`}
                >
                  <button
                    onClick={() => setSelectedId(fee._id)}
                    className="flex-1 text-left text-sm"
                  >
                    <div
                      className={
                        fee.name.trim()
                          ? "font-medium text-slate-900"
                          : "italic text-slate-400"
                      }
                    >
                      {fee.name.trim() || "Untitled Fee"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {fee.calculationType === "Percentage" && fee.percentage !== undefined
                        ? `${fee.percentage}% — Percentage`
                        : fee.calculationType === "Flat Amount" && fee.amount !== undefined
                        ? `£${fee.amount.toLocaleString()} — Flat Amount`
                        : fee.calculationType
                        ? fee.calculationType
                        : "No calculation type set"}
                    </div>
                  </button>
                  {!isLocked && (
                    <button
                      onClick={() => handleDelete(fee._id)}
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

        {/* Right: detail form */}
        <div ref={detailPanelRef} className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <FeeDetail key={selected._id} record={selected} allRecords={records} allProducts={allProducts} isLocked={isLocked} />
          ) : (
            <div className="text-sm text-slate-500">
              Add a fee to get started.
            </div>
          )}
        </div>
      </div>
      )}


      <ImportDialog<FeeRecord>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Fees"
        acceptFileTypes=".csv,.xls,.xlsx,.yaml,.yml"
        parseFile={(text, filename) => parseFeesFile(text, filename)}
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0">
            <span className="font-medium">{r.name}</span>
            {r.calculationType && (
              <span className="ml-2 text-xs text-slate-500">
                {r.calculationType === "Percentage" && r.percentage !== undefined
                  ? `${r.percentage}%`
                  : r.calculationType === "Flat Amount" && r.amount !== undefined
                  ? `£${r.amount.toLocaleString()}`
                  : r.calculationType}
              </span>
            )}
          </div>
        )}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={buildPreview}
        onDownload={(meta) => downloadFeesYaml(exportRows, meta)}
      />
      </div>
    </div>
  );
}

// ─── Detail form ──────────────────────────────────────────────────────────────

function FeeDetail({
  record,
  allRecords,
  allProducts,
  isLocked,
}: {
  record: Doc<"fees">;
  allRecords: Doc<"fees">[];
  allProducts: string[];
  isLocked: boolean;
}) {
  const update = useMutation(api.fees.update);

  const [name, setName] = useState(record.name);
  const [feePaidBy, setFeePaidBy] = useState(record.feePaidBy ?? "");
  const [calculationType, setCalculationType] = useState<"Flat Amount" | "Percentage" | "">(
    record.calculationType ?? "",
  );
  const [basisSource, setBasisSource] = useState(record.basisSource ?? "");
  const [percentage, setPercentage] = useState(
    record.percentage !== undefined ? String(record.percentage) : "",
  );
  const [amount, setAmount] = useState(
    record.amount !== undefined ? String(record.amount) : "",
  );
  const [collectionMethod, setCollectionMethod] = useState(record.collectionMethod ?? "");
  const [autoApply, setAutoApply] = useState(record.autoApply ?? false);
  const [appliedToProducts, setAppliedToProducts] = useState<string[]>(
    record.appliedToProducts ?? [],
  );
  const [notes, setNotes] = useState(record.notes ?? "");

  async function persist(overrides?: {
    name?: string;
    feePaidBy?: string;
    calculationType?: "Flat Amount" | "Percentage" | "";
    basisSource?: string;
    percentage?: string;
    amount?: string;
    collectionMethod?: string;
    autoApply?: boolean;
    appliedToProducts?: string[];
    notes?: string;
  }) {
    const resolvedName = (overrides?.name ?? name).trim();
    if (!resolvedName) {
      toast.error("Name is required.");
      return;
    }
    const duplicate = allRecords.find(
      (r) =>
        r._id !== record._id &&
        r.name.trim().toLowerCase() === resolvedName.toLowerCase(),
    );
    if (duplicate) {
      toast.error(`A fee named "${resolvedName}" already exists.`);
      return;
    }

    const resolvedCalcType = overrides?.calculationType ?? calculationType;
    const resolvedPercentage = overrides?.percentage ?? percentage;
    const resolvedAmount = overrides?.amount ?? amount;

    const parsedPercentage =
      resolvedCalcType === "Percentage" && resolvedPercentage !== ""
        ? parseFloat(resolvedPercentage)
        : undefined;
    const parsedAmount =
      resolvedCalcType === "Flat Amount" && resolvedAmount !== ""
        ? parseFloat(resolvedAmount)
        : undefined;

    await update({
      id: record._id,
      name: resolvedName,
      feePaidBy: (overrides?.feePaidBy ?? feePaidBy) || undefined,
      calculationType: resolvedCalcType || undefined,
      basisSource:
        resolvedCalcType === "Percentage"
          ? (overrides?.basisSource ?? basisSource) || undefined
          : undefined,
      percentage: parsedPercentage,
      amount: parsedAmount,
      collectionMethod: (overrides?.collectionMethod ?? collectionMethod) || undefined,
      autoApply: overrides?.autoApply ?? autoApply,
      appliedToProducts: overrides?.appliedToProducts ?? appliedToProducts,
      notes: (overrides?.notes ?? notes) || undefined,
    });
    toast.success("Saved");
  }

  function handleSelectChange(
    setter: (v: string) => void,
    overrideKey: string,
    value: string,
  ) {
    setter(value);
    persist({ [overrideKey]: value });
  }

  function handleCalculationTypeChange(value: "Flat Amount" | "Percentage" | "") {
    setCalculationType(value);
    persist({ calculationType: value });
  }

  function handleAutoApplyChange(checked: boolean) {
    setAutoApply(checked);
    persist({ autoApply: checked });
  }

  function handleToggleProduct(prod: string) {
    const next = appliedToProducts.includes(prod)
      ? appliedToProducts.filter((p) => p !== prod)
      : [...appliedToProducts, prod];
    setAppliedToProducts(next);
    persist({ appliedToProducts: next });
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <Label htmlFor="fee-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="fee-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => persist()}
          disabled={isLocked}
          className={!name.trim() ? "border-red-400 focus:border-red-400" : ""}
        />
        {!name.trim() && (
          <p className="mt-1 text-xs text-red-500">Name is required.</p>
        )}
      </div>

      {/* Fee Paid By */}
      <div>
        <Label htmlFor="fee-paid-by">Fee Paid By</Label>
        <select
          id="fee-paid-by"
          value={feePaidBy}
          onChange={(e) => handleSelectChange(setFeePaidBy, "feePaidBy", e.target.value)}
          disabled={isLocked}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">— Select —</option>
          {FEES_PICKLISTS.feePaidBy.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {/* Calculation Type */}
      <div>
        <Label htmlFor="fee-calc-type">Calculation Type</Label>
        <select
          id="fee-calc-type"
          value={calculationType}
          onChange={(e) =>
            handleCalculationTypeChange(e.target.value as "Flat Amount" | "Percentage" | "")
          }
          disabled={isLocked}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">— Select —</option>
          {FEES_PICKLISTS.calculationType.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {/* Percentage fields — only when Calculation Type = Percentage */}
      {calculationType === "Percentage" && (
        <>
          <div>
            <Label htmlFor="fee-basis-source">Basis Source</Label>
            <select
              id="fee-basis-source"
              value={basisSource}
              onChange={(e) =>
                handleSelectChange(setBasisSource, "basisSource", e.target.value)
              }
              disabled={isLocked}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">— Select —</option>
              {FEES_PICKLISTS.basisSource.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="fee-percentage">Percentage (%)</Label>
            <Input
              id="fee-percentage"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              onBlur={() => persist()}
              disabled={isLocked}
              placeholder="e.g. 1.5"
              className="mt-1"
            />
          </div>
        </>
      )}

      {/* Amount field — only when Calculation Type = Flat Amount */}
      {calculationType === "Flat Amount" && (
        <div>
          <Label htmlFor="fee-amount">Amount</Label>
          <Input
            id="fee-amount"
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => persist()}
            disabled={isLocked}
            placeholder="e.g. 1500"
            className="mt-1"
          />
        </div>
      )}

      {/* Collection Method */}
      <div>
        <Label htmlFor="fee-collection-method">Collection Method</Label>
        <select
          id="fee-collection-method"
          value={collectionMethod}
          onChange={(e) =>
            handleSelectChange(setCollectionMethod, "collectionMethod", e.target.value)
          }
          disabled={isLocked}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">— Select —</option>
          {FEES_PICKLISTS.collectionMethod.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {/* Auto Apply */}
      <div>
        <label className={`flex items-center gap-2 text-sm font-medium text-slate-700 ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => handleAutoApplyChange(e.target.checked)}
            disabled={isLocked}
            className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed"
          />
          Auto Apply
          <span className="text-xs font-normal text-slate-500">
            (auto-suggested on matching products)
          </span>
        </label>
      </div>

      {/* Applied To Products — only when Auto Apply = true */}
      {autoApply && (
        <div>
          <Label>Applied To Products</Label>
          {allProducts.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              No products found. Add products in the Product Hierarchy Builder first.
            </p>
          ) : (
            <>
              <div className="mt-1 flex gap-2">
                {!isLocked && (
                  <>
                    <button
                      onClick={() => { setAppliedToProducts(allProducts); persist({ appliedToProducts: allProducts }); }}
                      className="text-xs font-medium text-[var(--color-blue)] hover:underline"
                    >
                      Select all
                    </button>
                    {appliedToProducts.length > 0 && (
                      <>
                        <span className="text-xs text-slate-300">|</span>
                        <button
                          onClick={() => { setAppliedToProducts([]); persist({ appliedToProducts: [] }); }}
                          className="text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline"
                        >
                          Clear all
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-2">
              {allProducts.map((prod) => (
                <label key={prod} className={`flex items-center gap-2 text-sm ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={appliedToProducts.includes(prod)}
                    onChange={() => handleToggleProduct(prod)}
                    disabled={isLocked}
                    className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed"
                  />
                  {prod}
                </label>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <Label htmlFor="fee-notes">Notes</Label>
        <textarea
          id="fee-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => persist()}
          disabled={isLocked}
          placeholder="Optional notes…"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {/* Save */}
      {!isLocked && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={() => persist()}
            className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
