"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddCardForm({ subphaseId }: { subphaseId: Id<"subphases"> }) {
  const createCard = useMutation(api.heatmap.createCard);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createCard({ subphaseId, name: trimmed, type: "low" });
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-white/30 px-2 py-1.5 text-[11px] text-white/70 hover:border-white/60 hover:text-white"
      >
        + Add card
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-white/95 p-1.5">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder="Card name"
        className="h-7 text-xs"
      />
      <div className="flex gap-1">
        <Button size="xs" onClick={handleAdd} className="flex-1">
          Add
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setName("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
