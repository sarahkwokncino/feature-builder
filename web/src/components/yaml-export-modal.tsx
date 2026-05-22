"use client";

import { useEffect, useState } from "react";
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

export type YamlMeta = { storyId: string; title: string; featureArea: string };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultMeta: YamlMeta;
  /** Receives the confirmed meta — caller does the download */
  onDownload: (meta: YamlMeta) => void;
  /** Live YAML preview string given current meta */
  buildPreview: (meta: YamlMeta) => string;
};

export function YamlExportModal({
  open,
  onOpenChange,
  defaultMeta,
  onDownload,
  buildPreview,
}: Props) {
  const [meta, setMeta] = useState<YamlMeta>(defaultMeta);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (open) {
      setMeta(defaultMeta);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setPreview(buildPreview(meta));
  }, [meta, buildPreview]);

  function set(key: keyof YamlMeta, value: string) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export YAML</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="yaml-story-id">Story ID</Label>
              <Input
                id="yaml-story-id"
                value={meta.storyId}
                onChange={(e) => set("storyId", e.target.value)}
                placeholder="e.g. COV-CONFIG-001"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="yaml-title">Title</Label>
              <Input
                id="yaml-title"
                value={meta.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-slate-500">
              YAML preview
            </Label>
            <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre">
              {preview}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onDownload(meta);
              onOpenChange(false);
            }}
          >
            Download YAML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
