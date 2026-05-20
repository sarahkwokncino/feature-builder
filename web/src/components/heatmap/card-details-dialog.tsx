"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
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
import { toast } from "sonner";

type Card = Doc<"cards">;

const CARD_TYPES = [
  { value: "low", label: "Native — Low Config" },
  { value: "high", label: "Native — High Config" },
  { value: "manual", label: "Manual" },
  { value: "custom", label: "Custom" },
  { value: "linked", label: "Linked Tool" },
] as const;

const CARD_STATUSES = [
  { value: "not-configured", label: "Not configured" },
  { value: "configured", label: "Configured" },
  { value: "linked", label: "Linked" },
] as const;

export function CardDetailsDialog({
  card,
  open,
  onOpenChange,
}: {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateCard = useMutation(api.heatmap.updateCard);
  const deleteCard = useMutation(api.heatmap.deleteCard);

  const [name, setName] = useState("");
  const [sub, setSub] = useState("");
  const [type, setType] = useState<Card["type"]>("low");
  const [status, setStatus] = useState<Card["status"]>("not-configured");

  useEffect(() => {
    if (card) {
      setName(card.name);
      setSub(card.sub ?? "");
      setType(card.type);
      setStatus(card.status);
    }
  }, [card]);

  if (!card) return null;

  async function handleSave() {
    if (!card) return;
    await updateCard({
      id: card._id,
      name: name.trim() || card.name,
      sub: sub.trim() || undefined,
      type,
      status,
    });
    toast.success("Card updated");
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!card) return;
    if (!confirm(`Delete "${card.name}"?`)) return;
    await deleteCard({ id: card._id });
    toast.success("Card deleted");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feature details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="card-name">Name</Label>
            <Input
              id="card-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="card-sub">Subtitle</Label>
            <Input
              id="card-sub"
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="e.g. Document Manager"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="card-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as Card["type"])}
              >
                <SelectTrigger id="card-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="card-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Card["status"])}
              >
                <SelectTrigger id="card-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Notes / requirements (placeholder for bespoke configurator inputs)
            </Label>
            <Textarea
              rows={4}
              placeholder="When you wire a bespoke configurator for this card, this section will host its inputs."
              disabled
            />
          </div>
        </div>
        <DialogFooter className="!justify-between">
          <Button variant="ghost" onClick={handleDelete}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
