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

type Scope = "covenants" | "checklist";

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

  const keys = Object.keys(labels);
  const [activeKey, setActiveKey] = useState(keys[0]);
  const [newValue, setNewValue] = useState("");

  const valueMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of keys) m.set(k, defaults[k] ?? []);
    if (stored) {
      for (const p of stored) m.set(p.key, p.values);
    }
    return m;
  }, [stored, defaults, keys]);

  const values = valueMap.get(activeKey) ?? [];

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
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>Manage picklists</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => setActiveKey(k)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                k === activeKey
                  ? "bg-[var(--color-blue)] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {labels[k]}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
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
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
