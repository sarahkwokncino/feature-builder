"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ImportMode = "append" | "replace";

type Props<T> = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  acceptFileTypes: string;
  /** Parse text → records or error string */
  parseFile: (text: string, filename: string) => T[] | string;
  /** Called when user confirms — receives records + mode */
  onConfirm: (records: T[], mode: ImportMode) => Promise<void>;
  /** Render a single preview row */
  renderPreviewRow: (record: T, index: number) => React.ReactNode;
};

export function ImportDialog<T>({
  open,
  onOpenChange,
  title,
  acceptFileTypes,
  parseFile,
  onConfirm,
  renderPreviewRow,
}: Props<T>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setPending(null);
    setError(null);
    setMode("append");
    onOpenChange(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseFile(text, file.name);
      if (typeof result === "string") {
        setError(result);
        setPending(null);
      } else {
        setPending(result);
        setError(null);
      }
    };
    reader.readAsText(file);
    // reset so the same file can be re-selected
    e.target.value = "";
  }

  async function handleConfirm() {
    if (!pending) return;
    setSaving(true);
    try {
      await onConfirm(pending, mode);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={acceptFileTypes}
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="w-full"
            >
              Choose file…
            </Button>
            <p className="mt-1 text-xs text-slate-500">
              Accepted: {acceptFileTypes}
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Preview */}
          {pending && (
            <>
              <p className="text-sm text-slate-700">
                Found <strong>{pending.length}</strong>{" "}
                {pending.length === 1 ? "record" : "records"}.
              </p>

              <div className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-sm">
                {pending.slice(0, 20).map((r, i) => renderPreviewRow(r, i))}
                {pending.length > 20 && (
                  <div className="mt-1 text-xs text-slate-400">
                    …and {pending.length - 20} more
                  </div>
                )}
              </div>

              {/* Append / replace */}
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    value="append"
                    checked={mode === "append"}
                    onChange={() => setMode("append")}
                  />
                  Append to existing
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    value="replace"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                  />
                  Replace all existing
                </label>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          {pending && (
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? "Importing…" : `Import ${pending.length} record${pending.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
