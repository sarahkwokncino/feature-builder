"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Single "Export" button that opens a small format picker (YAML / Excel).
 * Replaces the old "Export Excel" + "Export YAML" button pair.
 */
export function ExportButton({
  onExcelClick,
  onYamlClick,
  disabled,
  size = "sm",
}: {
  onExcelClick: () => void;
  onYamlClick: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        size={size}
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        Export
        <span className="ml-1 text-[10px] opacity-60">▾</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => { setOpen(false); onYamlClick(); }}
          >
            Export YAML
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => { setOpen(false); onExcelClick(); }}
          >
            Export Excel
          </button>
        </div>
      )}
    </div>
  );
}
