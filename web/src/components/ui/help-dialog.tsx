"use client";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function HelpDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm text-slate-700">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HelpScreenshot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      <p className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 text-center">{caption}</p>
    </div>
  );
}

export function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

export function HelpTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800">
      {children}
    </div>
  );
}

export function HelpSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-1.5 text-xs text-slate-600 list-decimal pl-4">
      {steps.map((s, i) => <li key={i} dangerouslySetInnerHTML={{ __html: s }} />)}
    </ol>
  );
}

export function HelpBullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
      {items.map((s, i) => <li key={i} dangerouslySetInnerHTML={{ __html: s }} />)}
    </ul>
  );
}

export function HelpTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
      {rows.map(([label, desc], i) => (
        <div key={i} className="px-4 py-3">
          <p className="font-medium text-slate-800 text-xs">{label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
        </div>
      ))}
    </div>
  );
}
