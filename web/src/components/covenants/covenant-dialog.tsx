"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COVENANT_CATEGORY_TYPE_MAP,
  COV_TYPE_KEY_PREFIX,
} from "@/lib/picklist-defaults";
import { toast } from "sonner";

// base-ui's Select uses `null` as the empty/unset value (shows placeholder).

export function CovenantDialog({
  cardId,
  record,
  open,
  onOpenChange,
  picklistMap,
}: {
  cardId: Id<"cards">;
  record: Doc<"covenants"> | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  picklistMap: Map<string, string[]>;
}) {
  const create = useMutation(api.covenants.create);
  const update = useMutation(api.covenants.update);

  // Load all covenants-scope picklist rows so we can derive the covType: entries
  const storedPicklists = useQuery(api.picklists.listForScope, { scope: "covenants" });

  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [frequency, setFrequency] = useState("");
  const [description, setDescription] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [graceDays, setGraceDays] = useState("");

  useEffect(() => {
    if (record) {
      setCategory(record.category ?? "");
      setType(record.type ?? "");
      setFrequency(record.frequency ?? "");
      setDescription(record.description ?? "");
      setEffectiveDate(record.effectiveDate ?? "");
      setGraceDays(record.graceDays !== undefined ? String(record.graceDays) : "");
    } else if (open) {
      setCategory("");
      setType("");
      setFrequency("");
      setDescription("");
      setEffectiveDate("");
      setGraceDays("");
    }
  }, [record, open]);

  // Build category→types map: stored covType: rows override defaults
  const categoryTypeMap = useMemo(() => {
    const m: Record<string, string[]> = { ...COVENANT_CATEGORY_TYPE_MAP };
    if (storedPicklists) {
      for (const row of storedPicklists) {
        if (row.key.startsWith(COV_TYPE_KEY_PREFIX)) {
          const cat = row.key.slice(COV_TYPE_KEY_PREFIX.length);
          m[cat] = row.values;
        }
      }
    }
    return m;
  }, [storedPicklists]);

  const categoryOptions = picklistMap.get("category") ?? [];
  const frequencyOptions = picklistMap.get("frequency") ?? [];
  const typeOptions = category ? (categoryTypeMap[category] ?? []) : [];

  async function handleSave() {
    const derivedName = type || category || "Untitled";
    if (record) {
      await update({
        id: record._id,
        name: derivedName,
        category: category || undefined,
        type: type || undefined,
        frequency: frequency || undefined,
        description: description || undefined,
        effectiveDate: effectiveDate || undefined,
        graceDays: graceDays ? Number(graceDays) : undefined,
      });
      toast.success("Covenant updated");
    } else {
      await create({
        cardId,
        name: derivedName,
        category: category || undefined,
        type: type || undefined,
        frequency: frequency || undefined,
        description: description || undefined,
        effectiveDate: effectiveDate || undefined,
        graceDays: graceDays ? Number(graceDays) : undefined,
      });
      toast.success("Covenant created");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {record ? "Edit covenant" : "Create new covenant"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cov-category">Category</Label>
              <Select
                value={category || null}
                onValueChange={(v: string | null) => {
                  setCategory(v ?? "");
                  setType("");
                }}
              >
                <SelectTrigger id="cov-category" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>—</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cov-type">Covenant Type</Label>
              <Select
                value={type || null}
                onValueChange={(v: string | null) => setType(v ?? "")}
                disabled={!category}
              >
                <SelectTrigger id="cov-type" className="w-full">
                  <SelectValue
                    placeholder={category ? "Select…" : "Pick a category first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>—</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="cov-freq">Frequency Template</Label>
            <Select
              value={frequency || null}
              onValueChange={(v: string | null) => setFrequency(v ?? "")}
            >
              <SelectTrigger id="cov-freq" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>—</SelectItem>
                {frequencyOptions.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cov-effective-date">Effective Date</Label>
              <Input
                id="cov-effective-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cov-grace-days">Grace Days</Label>
              <Input
                id="cov-grace-days"
                type="number"
                min={0}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {record ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
