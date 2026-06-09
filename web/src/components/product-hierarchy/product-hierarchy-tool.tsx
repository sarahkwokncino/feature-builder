"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
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
import { buildProductHierarchyYaml, parseProductHierarchyYaml, downloadProductHierarchyExcel, parseProductHierarchyExcel, type ProductHierarchyExport } from "@/lib/product-hierarchy-export";
import { toast } from "sonner";
import { useBuilderLock } from "@/lib/use-builder-lock";
import { LockedBanner } from "@/components/ui/locked-banner";

type Line = Doc<"productLines">;
type PType = Doc<"productTypes">;
type Product = Doc<"products">;

// ── ItemRow — defined at module level to keep identity stable across renders ──

function ItemRow({
  id,
  name,
  isSelected,
  editingId,
  editValue,
  onSelect,
  onStartEdit,
  onChangeEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  id: string;
  name: string;
  isSelected?: boolean;
  editingId: string | null;
  editValue: string;
  onSelect?: () => void;
  onStartEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm cursor-pointer ${
        isSelected ? "bg-[var(--color-blue)]/10 text-[var(--color-blue)] font-medium" : "hover:bg-slate-50 text-slate-800"
      }`}
      onClick={onSelect}
    >
      {editingId === id ? (
        <Input
          autoFocus
          value={editValue}
          onChange={(e) => onChangeEdit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          onBlur={onSaveEdit}
          onClick={(e) => e.stopPropagation()}
          className="h-6 text-sm flex-1"
        />
      ) : (
        <span className="flex-1 truncate">{name}</span>
      )}
      {editingId !== id && (
        <div className="hidden group-hover:flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onStartEdit}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50"
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}

// ── Picklist Manager Dialog ───────────────────────────────────────────────────

function PicklistManagerDialog({
  open,
  onOpenChange,
  lines,
  types,
  products,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lines: Line[];
  types: PType[];
  products: Product[];
  projectId: Id<"projects">;
}) {
  const createLine = useMutation(api.productHierarchy.createLine);
  const updateLine = useMutation(api.productHierarchy.updateLine);
  const deleteLine = useMutation(api.productHierarchy.deleteLine);
  const createType = useMutation(api.productHierarchy.createType);
  const updateType = useMutation(api.productHierarchy.updateType);
  const deleteType = useMutation(api.productHierarchy.deleteType);
  const createProduct = useMutation(api.productHierarchy.createProduct);
  const updateProduct = useMutation(api.productHierarchy.updateProduct);
  const deleteProduct = useMutation(api.productHierarchy.deleteProduct);

  const [selectedLineId, setSelectedLineId] = useState<Id<"productLines"> | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<Id<"productTypes"> | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<Id<"products"> | null>(null);

  const [newLine, setNewLine] = useState("");
  const [newType, setNewType] = useState("");
  const [newProduct, setNewProduct] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Product code column — tracks the editable code for the currently selected product
  const [codeValue, setCodeValue] = useState("");

  const filteredTypes = selectedLineId ? types.filter((t) => t.productLineId === selectedLineId) : [];
  const filteredProducts = selectedTypeId ? products.filter((p) => p.productTypeId === selectedTypeId) : [];

  const selectedLine = lines.find((l) => l._id === selectedLineId);
  const selectedType = types.find((t) => t._id === selectedTypeId);

  function selectProduct(p: Product | null) {
    setSelectedProductId(p?._id ?? null);
    setCodeValue(p?.productCode ?? "");
  }

  async function handleAddLine() {
    const name = newLine.trim();
    if (!name) return;
    const id = await createLine({ projectId, name });
    setSelectedLineId(id);
    setSelectedTypeId(null);
    selectProduct(null);
    setNewLine("");
  }

  async function handleAddType() {
    if (!selectedLineId) return;
    const name = newType.trim();
    if (!name) return;
    const id = await createType({ productLineId: selectedLineId, projectId, name });
    setSelectedTypeId(id);
    selectProduct(null);
    setNewType("");
  }

  async function handleAddProduct() {
    if (!selectedTypeId) return;
    const name = newProduct.trim();
    if (!name) return;
    const type = types.find((t) => t._id === selectedTypeId);
    if (!type) return;
    const id = await createProduct({ productTypeId: selectedTypeId, productLineId: type.productLineId, projectId, name });
    // Convex returns the new id; we don't have the full doc yet so just set id and blank code
    setSelectedProductId(id);
    setCodeValue("");
    setNewProduct("");
  }

  async function handleSaveEdit(id: string, level: "lines" | "types" | "products") {
    const name = editValue.trim();
    if (!name) { setEditingId(null); return; }
    if (level === "lines") await updateLine({ id: id as Id<"productLines">, name });
    else if (level === "types") await updateType({ id: id as Id<"productTypes">, name });
    else await updateProduct({ id: id as Id<"products">, name });
    setEditingId(null);
  }

  async function handleDeleteLine(id: Id<"productLines">, name: string) {
    if (!confirm(`Remove line "${name}" and all its types and products?`)) return;
    await deleteLine({ id });
    if (selectedLineId === id) { setSelectedLineId(null); setSelectedTypeId(null); selectProduct(null); }
  }

  async function handleDeleteType(id: Id<"productTypes">, name: string) {
    if (!confirm(`Remove type "${name}" and all its products?`)) return;
    await deleteType({ id });
    if (selectedTypeId === id) { setSelectedTypeId(null); selectProduct(null); }
  }

  async function handleDeleteProduct(id: Id<"products">, name: string) {
    if (!confirm(`Remove product "${name}"?`)) return;
    await deleteProduct({ id });
    if (selectedProductId === id) selectProduct(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] !w-[1100px]">
        <DialogHeader>
          <DialogTitle>Manage Product Hierarchy</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-0 divide-x divide-slate-200 rounded-lg border border-slate-200 overflow-hidden min-h-[380px]">

          {/* ── Column 1: Product Lines ── */}
          <div className="flex flex-col">
            <div className="bg-blue-50 border-b border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Product Lines</p>
              <p className="text-[10px] text-slate-400 mt-0.5">LLC_BI__Product_Line__c</p>
            </div>
            <ul className="flex-1 overflow-auto p-1.5 space-y-0.5">
              {lines.length === 0 && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">No lines yet.</li>
              )}
              {lines.map((l) => (
                <ItemRow
                  key={l._id}
                  id={l._id}
                  name={l.name}
                  isSelected={selectedLineId === l._id}
                  editingId={editingId}
                  editValue={editValue}
                  onSelect={() => { setSelectedLineId(l._id); setSelectedTypeId(null); selectProduct(null); }}
                  onStartEdit={() => { setEditingId(l._id); setEditValue(l.name); }}
                  onChangeEdit={setEditValue}
                  onSaveEdit={() => handleSaveEdit(l._id, "lines")}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDeleteLine(l._id, l.name)}
                />
              ))}
            </ul>
            <div className="border-t border-slate-200 p-2 flex gap-1.5">
              <Input
                value={newLine}
                onChange={(e) => setNewLine(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddLine(); }}
                placeholder="Add line…"
                className="h-7 text-xs"
              />
              <Button size="sm" onClick={handleAddLine} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          </div>

          {/* ── Column 2: Product Types ── */}
          <div className="flex flex-col">
            <div className="bg-green-50 border-b border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">
                Product Types
                {selectedLine && <span className="ml-1 font-normal normal-case text-slate-500">— {selectedLine.name}</span>}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">LLC_BI__Product_Type__c</p>
            </div>
            <ul className="flex-1 overflow-auto p-1.5 space-y-0.5">
              {!selectedLineId && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">← Select a product line</li>
              )}
              {selectedLineId && filteredTypes.length === 0 && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">No types yet.</li>
              )}
              {filteredTypes.map((t) => (
                <ItemRow
                  key={t._id}
                  id={t._id}
                  name={t.name}
                  isSelected={selectedTypeId === t._id}
                  editingId={editingId}
                  editValue={editValue}
                  onSelect={() => { setSelectedTypeId(t._id); selectProduct(null); }}
                  onStartEdit={() => { setEditingId(t._id); setEditValue(t.name); }}
                  onChangeEdit={setEditValue}
                  onSaveEdit={() => handleSaveEdit(t._id, "types")}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDeleteType(t._id, t.name)}
                />
              ))}
            </ul>
            <div className="border-t border-slate-200 p-2 flex gap-1.5">
              <Input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddType(); }}
                placeholder={selectedLineId ? "Add type…" : "Select a line first"}
                disabled={!selectedLineId}
                className="h-7 text-xs"
              />
              <Button size="sm" onClick={handleAddType} disabled={!selectedLineId} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          </div>

          {/* ── Column 3: Products ── */}
          <div className="flex flex-col">
            <div className="bg-purple-50 border-b border-slate-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                Products
                {selectedType && <span className="ml-1 font-normal normal-case text-slate-500">— {selectedType.name}</span>}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">LLC_BI__Product__c</p>
            </div>
            <ul className="flex-1 overflow-auto p-1.5 space-y-0.5">
              {!selectedTypeId && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">← Select a product type</li>
              )}
              {selectedTypeId && filteredProducts.length === 0 && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">No products yet.</li>
              )}
              {filteredProducts.map((p) => (
                <ItemRow
                  key={p._id}
                  id={p._id}
                  name={p.name}
                  isSelected={selectedProductId === p._id}
                  editingId={editingId}
                  editValue={editValue}
                  onSelect={() => selectProduct(p)}
                  onStartEdit={() => { setEditingId(p._id); setEditValue(p.name); }}
                  onChangeEdit={setEditValue}
                  onSaveEdit={() => handleSaveEdit(p._id, "products")}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDeleteProduct(p._id, p.name)}
                />
              ))}
            </ul>
            <div className="border-t border-slate-200 p-2 flex gap-1.5">
              <Input
                value={newProduct}
                onChange={(e) => setNewProduct(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddProduct(); }}
                placeholder={selectedTypeId ? "Add product…" : "Select a type first"}
                disabled={!selectedTypeId}
                className="h-7 text-xs"
              />
              <Button size="sm" onClick={handleAddProduct} disabled={!selectedTypeId} className="h-7 px-2 text-xs shrink-0">+ Add</Button>
            </div>
          </div>

          {/* ── Column 4: Product Code ── */}
          {(() => {
            const selProduct = selectedProductId ? products.find((p) => p._id === selectedProductId) : null;
            async function handleSaveCode() {
              if (!selProduct) return;
              await updateProduct({ id: selProduct._id, productCode: codeValue.trim() || undefined });
            }
            return (
              <div className="flex flex-col">
                <div className="bg-orange-50 border-b border-slate-200 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Product Code</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">LLC_BI__lookupKey__c · optional</p>
                </div>
                <div className="flex-1 p-3 flex flex-col gap-2">
                  {!selProduct ? (
                    <p className="text-xs text-slate-400 italic">← Select a product to set its code</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Product code for core integration — used to link this nCino product back to the originating core banking system.
                      </p>
                      <Input
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveCode(); }}
                        onBlur={handleSaveCode}
                        placeholder="e.g. COMM-RE-001"
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-slate-400">Optional. Saves on blur or Enter.</p>
                    </>
                  )}
                </div>
                <div className="border-t border-slate-200 p-2 h-[46px]" />
              </div>
            );
          })()}

          {/* ── Column 5: Full Product Name ── */}
          {(() => {
            const selProduct = selectedProductId ? products.find((p) => p._id === selectedProductId) : null;
            const selType = selProduct ? types.find((t) => t._id === selProduct.productTypeId) : null;
            const selLine = selProduct ? lines.find((l) => l._id === selProduct.productLineId) : null;
            const fullName = selProduct
              ? [selLine?.name, selType?.name, selProduct.name].filter(Boolean).join(" - ")
              : null;
            return (
              <div className="flex flex-col">
                <div className="bg-slate-50 border-b border-slate-200 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Full Product Name</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Auto-generated · read-only</p>
                </div>
                <div className="flex-1 p-3 flex flex-col justify-start gap-2">
                  {fullName ? (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono text-slate-800 break-words leading-relaxed">
                      {fullName}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      {!selectedLineId
                        ? "← Select a product line, type, and product"
                        : !selectedTypeId
                        ? "← Select a product type and product"
                        : "← Select a product"}
                    </p>
                  )}
                </div>
                <div className="border-t border-slate-200 p-2 h-[46px]" />
              </div>
            );
          })()}

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Tool ─────────────────────────────────────────────────────────────────

export function ProductHierarchyTool({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { id: projectId });
  const data = useQuery(api.productHierarchy.listForProject, { projectId });

  const createLine = useMutation(api.productHierarchy.createLine);
  const createType = useMutation(api.productHierarchy.createType);
  const createProduct = useMutation(api.productHierarchy.createProduct);
  const deleteLine = useMutation(api.productHierarchy.deleteLine);
  const deleteType = useMutation(api.productHierarchy.deleteType);
  const deleteProduct = useMutation(api.productHierarchy.deleteProduct);

  const [picklistOpen, setPicklistOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { isLocked, toggleLock } = useBuilderLock(projectId, "product-hierarchy");

  // Simulator state
  const [selectedLineId, setSelectedLineId] = useState<Id<"productLines"> | "">("");
  const [selectedTypeId, setSelectedTypeId] = useState<Id<"productTypes"> | "">("");
  const [selectedProductId, setSelectedProductId] = useState<Id<"products"> | "">("");

  const lines = data?.lines ?? [];
  const types = data?.types ?? [];
  const products = data?.products ?? [];

  const availableTypes = useMemo(
    () => (selectedLineId ? types.filter((t) => t.productLineId === selectedLineId) : []),
    [types, selectedLineId],
  );

  const availableProducts = useMemo(
    () => (selectedTypeId ? products.filter((p) => p.productTypeId === selectedTypeId) : []),
    [products, selectedTypeId],
  );

  const exportData = useMemo<ProductHierarchyExport>(
    () => ({ lines, types, products }),
    [lines, types, products],
  );

  const defaultMeta: YamlMeta = useMemo(
    () => ({
      storyId: "PROD-HIER-001",
      title: `Product Hierarchy — ${project?.name ?? ""}`,
      featureArea: "product-hierarchy",
    }),
    [project?.name],
  );

  async function handleImportConfirm(rows: ProductHierarchyExport[], _mode: ImportMode) {
    const imp = rows[0];
    if (!imp) return;
    for (const line of imp.lines) {
      const lineId = await createLine({ projectId, name: line.name, productObject: line.productObject });
      const lineTypes = imp.types.filter((t) => t.productLineId === line._id);
      for (const t of lineTypes) {
        const typeId = await createType({ productLineId: lineId, projectId, name: t.name, usageType: t.usageType, lookupKey: t.lookupKey });
        const typeProds = imp.products.filter((p) => p.productTypeId === t._id);
        for (const p of typeProds) {
          await createProduct({ productTypeId: typeId, productLineId: lineId, projectId, name: p.name, productCode: p.productCode, isLineOfCredit: p.isLineOfCredit, excludeFromLoanProducts: p.excludeFromLoanProducts });
        }
      }
    }
    toast.success(`Imported ${imp.lines.length} line(s), ${imp.types.length} type(s), ${imp.products.length} product(s)`);
  }

  if (project === undefined || data === undefined) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }
  if (project === null) {
    return <div className="p-6 text-sm text-red-600">Project not found.</div>;
  }

  const selectedLine = lines.find((l) => l._id === selectedLineId);
  const selectedType = types.find((t) => t._id === selectedTypeId);
  const selectedProduct = products.find((p) => p._id === selectedProductId);

  return (
    <div className="pb-6">
      {isLocked && <LockedBanner onUnlock={toggleLock} />}
      <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Product Hierarchy — {project.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lines.length} {lines.length === 1 ? "line" : "lines"} ·{" "}
            {types.length} {types.length === 1 ? "type" : "types"} ·{" "}
            {products.length} {products.length === 1 ? "product" : "products"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPicklistOpen(true)} disabled={isLocked}>
            Manage picklists
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isLocked}>Import</Button>
          <Button
            variant="outline"
            onClick={() => downloadProductHierarchyExcel(exportData)}
            disabled={lines.length === 0}
          >
            Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => setYamlOpen(true)}
            disabled={lines.length === 0}
          >
            Export YAML
          </Button>
        </div>
      </div>

      {/* Simulator card — mirrors the nCino Loan form */}
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Preview Playground</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
          Example only — not saved or exported
        </span>
        <span className="text-xs text-slate-400">Click <button onClick={() => setPicklistOpen(true)} className="text-[var(--color-blue)] hover:underline">Manage picklists</button> to configure values.</span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Card title bar */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">New Loan — Product Selection</span>
          <span className="text-[10px] text-slate-400 ml-auto">LLC_BI__Loan__c</span>
        </div>

        <div className="p-5 space-y-5">
          {/* Row 1: Product Line + Product Type */}
          <div className="grid grid-cols-2 gap-5">
            {/* Product Line */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                * Product Line
                <span className="ml-1 font-normal text-slate-400 text-[10px]">LLC_BI__Product_Line__c</span>
              </label>
              <select
                value={selectedLineId}
                onChange={(e) => {
                  setSelectedLineId(e.target.value as Id<"productLines"> | "");
                  setSelectedTypeId("");
                  setSelectedProductId("");
                }}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)]"
              >
                <option value="">--None--</option>
                {lines.map((l) => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Product Type — dependent on Product Line */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                * Product Type
                <span className="ml-1 font-normal text-slate-400 text-[10px]">LLC_BI__Product_Type__c</span>
              </label>
              <select
                value={selectedTypeId}
                disabled={!selectedLineId}
                onChange={(e) => {
                  setSelectedTypeId(e.target.value as Id<"productTypes"> | "");
                  setSelectedProductId("");
                }}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                <option value="">--None--</option>
                {availableTypes.map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
              {selectedLineId && availableTypes.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600">No types defined for this line yet — add them in Manage picklists.</p>
              )}
            </div>
          </div>

          {/* Row 2: Product — dependent on Product Type */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                * Product
                <span className="ml-1 font-normal text-slate-400 text-[10px]">LLC_BI__Product__c</span>
              </label>
              <select
                value={selectedProductId}
                disabled={!selectedTypeId}
                onChange={(e) => setSelectedProductId(e.target.value as Id<"products"> | "")}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[var(--color-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue)] disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                <option value="">--None--</option>
                {availableProducts.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
              {selectedTypeId && availableProducts.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600">No products defined for this type yet — add them in Manage picklists.</p>
              )}
            </div>

            {/* Product detail badges */}
            {selectedProduct && (
              <div className="flex items-end gap-2 pb-1">
                {selectedProduct.isLineOfCredit && (
                  <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700 font-medium">Line of Credit</span>
                )}
                {selectedProduct.excludeFromLoanProducts && (
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 font-medium">Excluded from Loan Products</span>
                )}
              </div>
            )}
          </div>

          {/* Selection summary */}
          {selectedLine && (
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold shrink-0">Full Product Name:</span>
                <span className="font-mono text-slate-800">
                  {[selectedLine.name, selectedType?.name, selectedProduct?.name].filter(Boolean).join(" - ")}
                </span>
              </div>
              <div className="border-t border-blue-100 pt-1.5 space-y-0.5 text-blue-700/80">
                <div><span className="font-semibold">Product Line:</span> {selectedLine.name}{selectedLine.productObject ? ` (${selectedLine.productObject})` : ""}</div>
                {selectedType && <div><span className="font-semibold">Product Type:</span> {selectedType.name}{selectedType.usageType ? ` · ${selectedType.usageType}` : ""}{selectedType.lookupKey ? ` · key: ${selectedType.lookupKey}` : ""}</div>}
                {selectedProduct && <div><span className="font-semibold">Product:</span> {selectedProduct.name}{selectedProduct.productCode ? ` · code: ${selectedProduct.productCode}` : ""}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {lines.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          No product lines yet. Click <strong>Manage picklists</strong> to add Product Lines, Types, and Products.
        </div>
      )}

      <PicklistManagerDialog
        open={picklistOpen}
        onOpenChange={setPicklistOpen}
        lines={lines}
        types={types}
        products={products}
        projectId={projectId}
      />

      <YamlExportModal
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        defaultMeta={defaultMeta}
        buildPreview={(meta) => buildProductHierarchyYaml(exportData, meta)}
        onDownload={(meta) => {
          const yaml = buildProductHierarchyYaml(exportData, meta);
          const blob = new Blob([yaml], { type: "text/yaml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${meta.storyId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.yaml`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
      />

      <ImportDialog<ProductHierarchyExport>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Product Hierarchy"
        acceptFileTypes=".yaml,.yml,.xls,.xlsx,.csv"
        parseFile={(text, filename) =>
          filename.endsWith(".yaml") || filename.endsWith(".yml")
            ? parseProductHierarchyYaml(text)
            : parseProductHierarchyExcel(text)
        }
        onConfirm={handleImportConfirm}
        renderPreviewRow={(r, i) => (
          <div key={i} className="border-b border-slate-100 py-1 last:border-0 text-xs">
            <strong>{r.lines.length}</strong> line(s) ·{" "}
            <strong>{r.types.length}</strong> type(s) ·{" "}
            <strong>{r.products.length}</strong> product(s)
          </div>
        )}
      />
      </div>
    </div>
  );
}
