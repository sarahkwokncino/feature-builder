"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AddSubphaseForm({ phaseId }: { phaseId: Id<"phases"> }) {
  const createSubphase = useMutation(api.heatmap.createSubphase);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createSubphase({ phaseId, name: trimmed });
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-white/70 hover:bg-white/10 hover:text-white"
        title="Add subphase"
      >
        +
      </button>
    );
  }

  return (
    <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 gap-1 rounded bg-white p-1 shadow">
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
        placeholder="Subphase name"
        className="h-6 w-32 text-xs"
      />
      <Button size="xs" onClick={handleAdd}>
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
        ×
      </Button>
    </div>
  );
}
