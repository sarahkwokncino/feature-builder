"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";

export function PhaseBanner({ phase }: { phase: Doc<"phases"> }) {
  const renamePhase = useMutation(api.heatmap.renamePhase);
  const deletePhase = useMutation(api.heatmap.deletePhase);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(phase.name);

  async function commit() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== phase.name) {
      await renamePhase({ id: phase._id, name: trimmed });
    } else {
      setName(phase.name);
    }
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete phase "${phase.name}" and everything inside?`))
      return;
    await deletePhase({ id: phase._id });
  }

  return (
    <div className="group/phase relative rounded-t-md px-4 py-2 text-center text-[12.5px] font-[650] text-[#eaf3ff] min-h-[42px] flex items-center justify-center" style={{background:"linear-gradient(180deg,#16365400,#13314c)",border:"1px solid var(--hm-line)",borderBottom:0,borderRadius:"8px 8px 0 0"}}>
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(phase.name);
              setEditing(false);
            }
          }}
          className="mx-auto h-6 max-w-[14rem] bg-white text-center text-xs text-slate-900"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full hover:underline"
        >
          {phase.name}
        </button>
      )}
      <button
        onClick={handleDelete}
        aria-label={`Delete ${phase.name}`}
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover/phase:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
