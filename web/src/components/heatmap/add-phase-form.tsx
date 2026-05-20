"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddPhaseForm({ heatmapId }: { heatmapId: Id<"heatmaps"> }) {
  const createPhase = useMutation(api.heatmap.createPhase);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createPhase({ heatmapId, name: trimmed });
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-t-md border border-dashed border-white/40 bg-transparent px-4 py-2 text-sm font-semibold text-white/70 hover:border-white/80 hover:text-white"
      >
        + Add phase
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-white/95 p-2">
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
        placeholder="Phase name"
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
