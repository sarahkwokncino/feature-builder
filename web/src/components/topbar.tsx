import Link from "next/link";
import { ReactNode } from "react";

export function Topbar({
  title,
  back,
  right,
}: {
  title: string;
  back?: { href: string; label?: string };
  right?: ReactNode;
}) {
  return (
    <header className="flex h-[52px] flex-shrink-0 items-center justify-between bg-[var(--color-navy)] px-5 text-white shadow-md">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">
          nCino
        </span>
        <span className="text-lg opacity-30">|</span>
        <h1 className="text-[15px] font-semibold">{title}</h1>
        {back ? (
          <Link
            href={back.href}
            className="ml-3 rounded border border-white/25 bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
          >
            ← {back.label ?? "Back"}
          </Link>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </header>
  );
}
