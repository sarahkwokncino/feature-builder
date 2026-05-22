"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  COVENANT_PICKLISTS,
  COV_TYPE_KEY_PREFIX,
  COVENANT_CATEGORY_TYPE_MAP,
} from "@/lib/picklist-defaults";

type Scope = "covenants" | "checklist";

// ── Covenant-Types sub-editor (shown when activeKey === "__covtypes__") ────────

function CovTypesEditor({
  categoryValues,
  storedRows,
}: {
  categoryValues: string[];
  storedRows: { key: string; values: string[] }[];
}) {
  const addValue = useMutation(api.picklists.addValue);
  const removeValue = useMutation(api.picklists.removeValue);
  const [newTypeInputs, setNewTypeInputs] = useState<Record<string, string>>({});

  function typesForCategory(cat: string): string[] {
    const stored = storedRows.find((r) => r.key === COV_TYPE_KEY_PREFIX + cat);
    return stored?.values ?? COVENANT_CATEGORY_TYPE_MAP[cat] ?? [];
  }

  async function handleAddType(cat: string) {
    const val = (newTypeInputs[cat] ?? "").trim();
    if (!val) return;
    await addValue({ scope: "covenants", key: COV_TYPE_KEY_PREFIX + cat, value: val });
    setNewTypeInputs((prev) => ({ ...prev, [cat]: "" }));
  }

  async function handleRemoveType(cat: string, val: string) {
    await removeValue({ scope: "covenants", key: COV_TYPE_KEY_PREFIX + cat, value: val });
  }

  // If the category has no stored row yet, seed it from defaults on first add
  async function ensureStoredRow(cat: string) {
    const stored = storedRows.find((r) => r.key === COV_TYPE_KEY_PREFIX + cat);
    if (!stored) {
      const defaults = COVENANT_CATEGORY_TYPE_MAP[cat] ?? [];
      // setValues initialises the row; addValue will do the same but we need
      // the row to exist before removeValue works — handled by addValue already
      // creating the row if missing, so no extra step needed.
      void defaults;
    }
  }

  return (
    <div className="max-h-[380px] overflow-auto space-y-4 pr-1">
      <p className="text-xs text-slate-500">
        Each category has its own list of covenant types (
        <code className="text-[10px]">LLC_BI__Covenant__c</code> ·{" "}
        <code className="text-[10px]">LLC_BI__Covenant_Type__c</code>).
      </p>
      {categoryValues.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          No categories defined yet — add some in the Category tab first.
        </p>
      )}
      {categoryValues.map((cat) => {
        const types = typesForCategory(cat);
        return (
          <div key={cat}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-blue)]">
              {cat}
            </div>
            <ul className="mb-1 space-y-1 rounded-md border border-slate-200 p-2">
              {types.length === 0 ? (
                <li className="px-2 py-1 text-xs italic text-slate-400">
                  No types yet.
                </li>
              ) : (
                types.map((t) => (
                  <li
                    key={t}
                    className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50"
                  >
                    <span>{t}</span>
                    <button
                      onClick={() => handleRemoveType(cat, t)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newTypeInputs[cat] ?? ""}
                onChange={(e) =>
                  setNewTypeInputs((prev) => ({ ...prev, [cat]: e.target.value }))
                }
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    await ensureStoredRow(cat);
                    await handleAddType(cat);
                  }
                }}
                placeholder={`Add type for ${cat}…`}
                className="text-xs"
              />
              <Button
                size="sm"
                onClick={async () => {
                  await ensureStoredRow(cat);
                  await handleAddType(cat);
                }}
              >
                + Add
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main PicklistEditor ────────────────────────────────────────────────────────

export function PicklistEditor({
  open,
  onOpenChange,
  scope,
  labels,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: Scope;
  labels: Record<string, string>;
  defaults: Record<string, string[]>;
}) {
  const stored = useQuery(api.picklists.listForScope, { scope });
  const addValue = useMutation(api.picklists.addValue);
  const removeValue = useMutation(api.picklists.removeValue);

  const isCovenants = scope === "covenants";
  const regularKeys = Object.keys(labels);

  // For covenants we add a special synthetic tab key
  const allTabs = isCovenants
    ? [regularKeys[0], "__covtypes__", ...regularKeys.slice(1)]
    : regularKeys;
  const allLabels: Record<string, string> = isCovenants
    ? { ...labels, __covtypes__: "Covenant Types" }
    : labels;

  const [activeKey, setActiveKey] = useState(allTabs[0]);
  const [newValue, setNewValue] = useState("");

  const valueMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of regularKeys) m.set(k, defaults[k] ?? []);
    if (stored) {
      for (const p of stored) {
        // Only map regular keys here; covType: rows are handled by CovTypesEditor
        if (!p.key.startsWith(COV_TYPE_KEY_PREFIX)) m.set(p.key, p.values);
      }
    }
    return m;
  }, [stored, defaults, regularKeys]);

  const values = activeKey !== "__covtypes__" ? (valueMap.get(activeKey) ?? []) : [];

  // Category values (needed by CovTypesEditor)
  const categoryValues = isCovenants
    ? (valueMap.get("category") ?? COVENANT_PICKLISTS.category)
    : [];

  // Rows with covType: prefix (for CovTypesEditor)
  const covTypeRows = useMemo(
    () => (stored ?? []).filter((r) => r.key.startsWith(COV_TYPE_KEY_PREFIX)),
    [stored],
  );

  async function handleAdd() {
    const v = newValue.trim();
    if (!v) return;
    await addValue({ scope, key: activeKey, value: v });
    setNewValue("");
  }

  async function handleRemove(value: string) {
    await removeValue({ scope, key: activeKey, value });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage picklists</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {allTabs.map((k) => (
            <button
              key={k}
              onClick={() => { setActiveKey(k); setNewValue(""); }}
              className={`rounded-md px-2.5 py-1 text-xs ${
                k === activeKey
                  ? "bg-[var(--color-blue)] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {allLabels[k]}
            </button>
          ))}
        </div>

        {/* Covenant Types special tab */}
        {activeKey === "__covtypes__" ? (
          <CovTypesEditor
            categoryValues={categoryValues}
            storedRows={covTypeRows}
          />
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="New value…"
              />
              <Button onClick={handleAdd}>+ Add</Button>
            </div>
            <ul className="max-h-64 space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
              {values.length === 0 ? (
                <li className="px-2 py-1 text-xs text-slate-500">
                  No values yet.
                </li>
              ) : (
                values.map((v) => (
                  <li
                    key={v}
                    className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50"
                  >
                    <span>{v}</span>
                    <button
                      onClick={() => handleRemove(v)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
