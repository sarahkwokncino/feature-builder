"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaygroundState } from "@/components/stages/playground-state-context";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YamlExportModal, type YamlMeta } from "@/components/yaml-export-modal";
import { ExportButton } from "@/components/ui/export-button";
import {
  buildFeesYaml,
  downloadFeesYaml,
  downloadFeesExcel,
  parseFeesFile,
  type FeeRecord,
} from "@/lib/export-import";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportDialog, type ImportMode } from "@/components/import-dialog";
import { FEES_PICKLISTS } from "@/lib/picklist-defaults";
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

export function FeesTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const records = useQuery(api.fees.listForProject, { projectId });
  const create = useMutation(api.fees.create);
  const remove = useMutation(api.fees.remove);
  const hierarchy = useQuery(api.productHierarchy.listForProject, { projectId });

  const update = useMutation(api.fees.update);
  const bulkImport = useMutation(api.fees.bulkImport);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "fees");

  const [activeTab, setActiveTab] = useState<"configure" | "matrix">("configure");
  const [selectedId, setSelectedId] = useState<Id<"fees"> | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
          <ExportButton
            disabled={records.length === 0}
            onExcelClick={() => downloadFeesExcel(exportRows)}
            onYamlClick={() => setYamlOpen(true)}
          />
          <Button variant="outline" onClick={() => setHelpOpen(true)}>? Help</Button>
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
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "configure" ? "Configure" : "Product Matrix"}
          </button>
        ))}
      </div>

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

      {activeTab === "matrix" && (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {allProducts.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No products configured. Add products in the{" "}
              <a
                href={`/projects/${projectId}/product-hierarchy`}
                className="font-medium text-[var(--color-blue)] hover:underline"
              >
                Product Hierarchy Builder
              </a>{" "}
              first.
            </div>
          ) : records.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No fees yet. Add fees in the Configure tab first.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-2 text-left font-medium text-slate-700">
                    Fee
                  </th>
                  {allProducts.map((p) => (
                    <th
                      key={p}
                      className="border-b border-r border-slate-200 px-2 py-2 text-center text-xs font-medium text-slate-600 last:border-r-0"
                      style={{ minWidth: "120px" }}
                    >
                      {p.split("-").join(" › ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((fee) => (
                  <tr key={fee._id} className="hover:bg-slate-50">
                    <td className="border-r border-slate-200 px-3 py-2 font-medium text-slate-800">
                      {fee.name}
                    </td>
                    {allProducts.map((prod) => (
                      <td
                        key={prod}
                        className="border-r border-slate-100 px-2 py-2 text-center last:border-r-0"
                      >
                        <input
                          type="checkbox"
                          checked={(fee.appliedToProducts ?? []).includes(prod)}
                          onChange={() => handleMatrixToggle(fee, prod)}
                          disabled={isLocked}
                          className="h-4 w-4 rounded border-slate-300 text-[var(--color-blue)] focus:ring-[var(--color-blue)] disabled:cursor-not-allowed"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

      <FeesHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </div>
  );
}

function FeesHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <HelpDialog open={open} onOpenChange={onOpenChange} title="Fees Builder — Help">
      <HelpSection title="What are Fees in nCino?">
        <p>Fees define the charges applied to a loan — both lender-side and borrower-side — including how they are calculated and how and when they are collected. Fees can be templated at the product level and applied to individual loans, or added ad hoc per deal.</p>
      </HelpSection>

      <HelpScreenshot src="/help-fees.png" alt="Fees on a loan" caption="Fees panel on a loan record in nCino" />

      <HelpSection title="Key concepts">
        <HelpTable rows={[
          ["Fee Type", "The named charge (e.g. Arrangement Fee, Broker Fee, Exit Fee). User-configurable."],
          ["Fee Paid By", "Borrower or Lender."],
          ["Calculation Type", "Flat Amount (fixed sum) or Percentage (of a basis source)."],
          ["Basis Source", "The amount the percentage applies to (e.g. Loan Amount). Only used when Calculation Type is Percentage."],
          ["Collection Method", "How the fee is recovered: Deducted from Loan (retained at drawdown), Cash (paid separately), or Add to Loan (capitalised)."],
          ["Auto Apply", "When checked, this fee is automatically added to any loan using a matching product."],
          ["Applied to Products", "Restricts the fee to specific Product Line-Type-Product combinations from the Product Hierarchy."],
        ]} />
      </HelpSection>

      <HelpSection title="How to use this builder">
        <p><strong>+ Add Fee</strong> — creates a new fee. Fill in the name, calculation type, and other fields in the detail panel on the right. Products are sourced from the Product Hierarchy Builder.</p>
        <p><strong>Import</strong> — import fees from a previously exported YAML or XLS file.</p>
        <p><strong>Export</strong> — downloads all configured fees as Excel or YAML.</p>
        <p>Use the <strong>Configure / Matrix tabs</strong> to switch between the list view and a product-fee matrix overview.</p>
      </HelpSection>

      <HelpTip>Products shown in &ldquo;Applied to Products&rdquo; are sourced from the <strong>Product Hierarchy Builder</strong>. Configure products there first before assigning fees to specific products.</HelpTip>
    </HelpDialog>
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

// ── Fees Preview Playground ───────────────────────────────────────────────────

type PreviewFee = {
  id: string;
  name: string;
  feePaidBy?: string;
  calculationType?: string;
  basisSource?: string;
  percentage?: number;
  amount?: number;
  collectionMethod?: string;
  autoApply?: boolean;
  overrideAmount?: string;
};

function feeValueLabel(fee: PreviewFee): string {
  if (fee.calculationType === "Percentage" && fee.percentage !== undefined)
    return `${fee.percentage}%`;
  const amount = fee.overrideAmount !== undefined
    ? parseFloat(fee.overrideAmount)
    : fee.amount;
  if (fee.calculationType === "Flat Amount" && amount !== undefined && !isNaN(amount))
    return `£${amount.toLocaleString()}`;
  return fee.calculationType ?? "—";
}

export function FeesPreviewPlayground({ projectId }: { projectId: Id<"projects"> }) {
  const records = useQuery(api.fees.listForProject, { projectId });

  const allFees: PreviewFee[] = useMemo(
    () => (records ?? []).map((r) => ({
      id: r._id,
      name: r.name,
      feePaidBy: r.feePaidBy,
      calculationType: r.calculationType,
      basisSource: r.basisSource,
      percentage: r.percentage,
      amount: r.amount,
      collectionMethod: r.collectionMethod,
      autoApply: r.autoApply,
    })),
    [records],
  );

  const { addedFees: added, setAddedFees: setAdded } = usePlaygroundState();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allFees;
    return allFees.filter((f) => f.name.toLowerCase().includes(q));
  }, [allFees, search]);

  function openDialog() {
    setSearch("");
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

  function handleApply() {
    const toAdd = filtered.filter((f) => selected.has(f.id) && !added.find((a) => a.id === f.id));
    setAdded((prev) => [...prev, ...toAdd]);
    setDialogOpen(false);
  }

  function handleRemove(id: string) {
    setAdded((prev) => prev.filter((f) => f.id !== id));
  }

  function handleAmountChange(id: string, value: string) {
    setAdded((prev) => prev.map((f) => f.id === id ? { ...f, overrideAmount: value } : f));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">
          Reflects your <span className="font-medium">Fees Builder</span> config.
        </span>
        <Button onClick={openDialog} className="ml-auto bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]">
          + Add Fees
        </Button>
      </div>

      {/* Added fees table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_100px_120px_100px_100px_120px_32px] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Fee Type</span>
          <span>Paid By</span>
          <span>Calc Type</span>
          <span>Basis Source</span>
          <span>Value</span>
          <span>Collection</span>
          <span />
        </div>
        {added.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
            No fees added yet — click <strong>+ Add Fees</strong> to select from your library.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {added.map((f) => (
              <li key={f.id} className="grid grid-cols-[1fr_100px_120px_100px_100px_120px_32px] gap-2 items-center px-4 py-2.5 hover:bg-slate-50 group">
                <span className="text-sm font-medium text-slate-800">{f.name}</span>
                <span className="text-xs text-slate-500">{f.feePaidBy || "—"}</span>
                <span className="text-xs text-slate-500">{f.calculationType || "—"}</span>
                <span className="text-xs text-slate-500">{f.basisSource || "—"}</span>
                {f.calculationType === "Flat Amount" && (!f.amount || f.amount === 0) ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">£</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={f.overrideAmount ?? ""}
                      onChange={(e) => handleAmountChange(f.id, e.target.value)}
                      placeholder="0.00"
                      className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-700 focus:border-[var(--color-blue)] focus:outline-none"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{feeValueLabel(f)}</span>
                )}
                <span className="text-xs text-slate-500">{f.collectionMethod || "—"}</span>
                <button
                  onClick={() => handleRemove(f.id)}
                  className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Fees dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="!max-w-4xl !max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Fees</DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">Select one or more fees from the list</p>
          </DialogHeader>

          {/* Search */}
          <div className="relative shrink-0">
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

          {/* Selection controls */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500">{selected.size} Selected Items</span>
            <button
              onClick={() => setSelected(new Set(filtered.map((f) => f.id)))}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Select All
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Clear Selection
            </button>
          </div>

          {/* Fee list */}
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200">
            <div className="sticky top-0 grid grid-cols-[36px_1fr_110px_130px_110px_130px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span />
              <span>Fee Type</span>
              <span>Fee Paid By</span>
              <span>Calculation Type</span>
              <span>Amount / %</span>
              <span>Collection Method</span>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
                {records === undefined ? "Loading…" : "No fees match your search."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((f) => {
                  const isSelected = selected.has(f.id);
                  const alreadyAdded = !!added.find((a) => a.id === f.id);
                  return (
                    <li
                      key={f.id}
                      onClick={() => !alreadyAdded && toggleSelect(f.id)}
                      className={`grid grid-cols-[36px_1fr_110px_130px_110px_130px] gap-2 items-center px-3 py-2.5 transition-colors ${
                        alreadyAdded
                          ? "opacity-40 cursor-not-allowed"
                          : isSelected
                          ? "bg-[var(--color-blue)]/8 cursor-pointer"
                          : "hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        <div className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold transition-colors ${
                          isSelected
                            ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white"
                            : "border-slate-300 text-slate-400 hover:border-[var(--color-blue)]"
                        }`}>
                          {isSelected ? "✓" : "+"}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-slate-800 truncate">{f.name}</span>
                      <span className="text-xs text-slate-500">{f.feePaidBy || "—"}</span>
                      <span className="text-xs text-slate-500">{f.calculationType || "—"}</span>
                      <span className="text-xs text-slate-500">{feeValueLabel(f)}</span>
                      <span className="text-xs text-slate-500">{f.collectionMethod || "—"}</span>
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
              onClick={handleApply}
              className="bg-[var(--color-blue)] hover:bg-[var(--color-blue-hover)]"
            >
              Apply Selected Fee{selected.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
