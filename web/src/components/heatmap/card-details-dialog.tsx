"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { FEATURE_DETAILS } from "@/lib/feature-details";

type Card = Doc<"cards">;

const CARD_TYPES = [
  { value: "low",    label: "Native — Low Config" },
  { value: "high",   label: "Native — High Config" },
  { value: "manual", label: "Manual" },
  { value: "custom", label: "Custom" },
  { value: "linked", label: "Linked Tool" },
] as const;

const CARD_STATUSES = [
  { value: "not-configured", label: "Not configured" },
  { value: "configured",     label: "Configured" },
  { value: "linked",         label: "Linked" },
] as const;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  configured:      { label: "Configured",     cls: "rsb-evidenced" },
  "not-configured":{ label: "Not configured", cls: "rsb-none" },
  linked:          { label: "Linked",         cls: "rsb-potential" },
};

export function CardDetailsDialog({
  card,
  open,
  builderRoute,
  onOpenChange,
}: {
  card: Card | null;
  open: boolean;
  builderRoute?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateCard = useMutation(api.heatmap.updateCard);
  const deleteCard = useMutation(api.heatmap.deleteCard);

  const [name, setName]       = useState("");
  const [sub, setSub]         = useState("");
  const [type, setType]       = useState<Card["type"]>("low");
  const [status, setStatus]   = useState<Card["status"]>("not-configured");
  const [editing, setEditing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (card) {
      setName(card.name);
      setSub(card.sub ?? "");
      setType(card.type);
      setStatus(card.status);
      setEditing(false);
    }
  }, [card]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

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
    setEditing(false);
  }

  async function handleDelete() {
    if (!card) return;
    if (!confirm(`Delete "${card.name}"?`)) return;
    await deleteCard({ id: card._id });
    toast.success("Card deleted");
    onOpenChange(false);
  }

  const badge = STATUS_BADGE[card?.status ?? "not-configured"] ?? STATUS_BADGE["not-configured"];
  const typeLabel = CARD_TYPES.find(t => t.value === card?.type)?.label ?? card?.type;
  const detail = card?.featureId ? FEATURE_DETAILS[card.featureId] : undefined;

  return (
    <>
      <div
        onClick={() => onOpenChange(false)}
        style={{
          position: "fixed", inset: 0, background: "#0006",
          zIndex: 40, display: open ? "block" : "none",
        }}
      />

      <div
        ref={drawerRef}
        aria-hidden={!open}
        style={{
          position: "fixed", top: 0, right: 0, height: "100vh",
          width: 460, maxWidth: "92vw", zIndex: 50,
          background: "#0b1d31", borderLeft: "1px solid #27537a",
          boxShadow: "-22px 0 60px #000a",
          transform: open ? "translateX(0)" : "translateX(105%)",
          transition: "transform .22s",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {card && (
          <>
            {/* Header */}
            <div style={{
              padding: "14px 16px 12px",
              borderBottom: "1px solid var(--hm-line)",
              position: "relative", flexShrink: 0,
            }}>
              <button
                onClick={() => onOpenChange(false)}
                aria-label="close"
                style={{
                  position: "absolute", top: 12, right: 12,
                  background: "#13314c", border: "1px solid var(--hm-line)",
                  color: "var(--hm-ink)", borderRadius: 7,
                  width: 30, height: 30, cursor: "pointer", fontSize: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >✕</button>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--hm-muted)" }}>
                {card.featureId ? `#${card.featureId}` : ""}
              </div>
              <h2 style={{ margin: "3px 0 0", fontSize: 18, color: "#fff", paddingRight: 36 }}>
                {card.name}
              </h2>
              {card.sub && (
                <div style={{ color: "var(--hm-muted)", fontSize: 12.5, marginTop: 2 }}>{card.sub}</div>
              )}
              <div style={{ marginTop: 7, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`covbadge ${badge.cls}`} style={{ fontSize: 10, borderRadius: 5, padding: "2px 8px", border: "1px solid", fontWeight: 600 }}>
                  {badge.label}
                </span>
                <span style={{ fontSize: 10, borderRadius: 5, padding: "2px 8px", border: "1px solid var(--hm-line)", color: "var(--hm-muted)" }}>
                  {typeLabel}
                </span>
              </div>
              {builderRoute && (
                <div style={{ marginTop: 12 }}>
                  <Link href={builderRoute} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "#1b4f72", border: "1px solid #27537a",
                    color: "#dfeaf5", borderRadius: 7, padding: "7px 14px",
                    fontSize: 13, fontWeight: 600, textDecoration: "none",
                  }}>
                    Open Feature Builder ↗
                  </Link>
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: "14px 16px 28px", overflowY: "auto", flex: 1 }}>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <div className="drawer-lbl">Description</div>
                {detail?.description
                  ? <div style={{ color: "#e0ecf6", fontSize: 13, lineHeight: 1.55 }}>{detail.description}</div>
                  : <Empty note="No description available." />}
              </div>

              {/* Roles */}
              <div style={{ marginBottom: 16 }}>
                <div className="drawer-lbl">Roles</div>
                {detail?.roles?.length
                  ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {detail.roles.map((r, i) => <span key={i} style={pillStyle}>{r}</span>)}
                    </div>
                  : <Empty note="No roles named in transcript." />}
              </div>

              {/* Process steps */}
              <div style={{ marginBottom: 16 }}>
                <div className="drawer-lbl">Process steps <span style={{ fontSize: 10, color: "var(--hm-muted)", fontStyle: "italic" }}>(E evidenced · I inferred)</span></div>
                {detail?.process_steps?.length
                  ? <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {detail.process_steps.map((s, i) => (
                        <li key={i} style={{ margin: "5px 0", paddingLeft: 24, position: "relative", color: "#cfe0ee", fontSize: 12.5 }}>
                          <span style={{
                            position: "absolute", left: 0, top: 2,
                            fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "0 3px",
                            ...(s.source === "evidenced"
                              ? { background: "#0b3d2e", color: "#5fe0a8", border: "1px solid #1f7d57" }
                              : { background: "#33300f", color: "#e6cf6b", border: "1px solid #8a7320" })
                          }}>
                            {s.source === "evidenced" ? "E" : "I"}
                          </span>
                          {s.step}
                          {s.note && <span style={{ color: "var(--hm-muted)", fontStyle: "italic" }}> — {s.note}</span>}
                        </li>
                      ))}
                    </ul>
                  : <Empty note="No process steps documented." />}
              </div>

              {/* Common integrations */}
              <div style={{ marginBottom: 16 }}>
                <div className="drawer-lbl">Common integrations</div>
                {detail?.common_integrations?.length
                  ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {detail.common_integrations.map((i, idx) => <span key={idx} style={pillStyle}>{i}</span>)}
                    </div>
                  : <Empty note="None mentioned." />}
              </div>

              {/* Community articles */}
              <div style={{ marginBottom: 16 }}>
                <div className="drawer-lbl">Community articles</div>
                {detail?.community_articles?.length
                  ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {detail.community_articles.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#7cc4ff", textDecoration: "none", fontSize: 12.5 }}
                          onMouseOver={e => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseOut={e => (e.currentTarget.style.textDecoration = "none")}
                        >
                          ↗ {a.title}
                        </a>
                      ))}
                    </div>
                  : <Empty note="No articles linked yet." />}
              </div>

              {/* Edit / delete */}
              {editing ? (
                <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--hm-line)", paddingTop: 14 }}>
                  <div className="drawer-lbl">Edit card</div>
                  <label style={labelStyle}>
                    Name
                    <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Subtitle
                    <input value={sub} onChange={e => setSub(e.target.value)} placeholder="e.g. Document Manager" style={inputStyle} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label style={labelStyle}>
                      Type
                      <select value={type} onChange={e => setType(e.target.value as Card["type"])} style={inputStyle}>
                        {CARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      Status
                      <select value={status} onChange={e => setStatus(e.target.value as Card["status"])} style={inputStyle}>
                        {CARD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
                    <button onClick={handleSave} style={btnPrimary}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: "1px solid var(--hm-line)", paddingTop: 14, display: "flex", gap: 8 }}>
                  <button onClick={() => setEditing(true)} style={btnSecondary}>Edit card</button>
                  <button onClick={handleDelete} style={{ ...btnSecondary, color: "#ff9a9a", borderColor: "#8a2626" }}>Delete</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{drawerCSS}</style>
    </>
  );
}

function Empty({ note }: { note: string }) {
  return (
    <div style={{
      border: "1px dashed var(--hm-line)", borderRadius: 8,
      padding: "10px 14px", color: "var(--hm-muted)", fontSize: 12,
      background: "#0c1f3355",
    }}>{note}</div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4,
  fontSize: 12, color: "var(--hm-muted)",
};

const inputStyle: React.CSSProperties = {
  background: "#0c2034", border: "1px solid var(--hm-line)",
  color: "var(--hm-ink)", borderRadius: 7, padding: "6px 9px",
  fontSize: 13, outline: "none", width: "100%",
};

const btnPrimary: React.CSSProperties = {
  background: "#1b4f72", border: "1px solid #27537a",
  color: "#dfeaf5", borderRadius: 7, padding: "6px 14px",
  fontSize: 12, cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#13314c", border: "1px solid var(--hm-line)",
  color: "var(--hm-muted)", borderRadius: 7, padding: "6px 14px",
  fontSize: 12, cursor: "pointer",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block", background: "#16314a",
  border: "1px solid var(--hm-line)", borderRadius: 999,
  padding: "2px 9px", fontSize: 11.5, color: "var(--hm-ink)",
};

const drawerCSS = `
.drawer-lbl {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #7fa6c4;
  margin-bottom: 5px;
}
.covbadge { font-size:10px;border-radius:5px;padding:2px 8px;border:1px solid;font-weight:600; }
.rsb-evidenced{color:#5fe0a8;border-color:#1f7d57 !important;background:#0b3d2e66}
.rsb-potential{color:#ffbf86;border-color:#8a5a20 !important;background:#3a280f66}
.rsb-confirmed{color:#ff9a9a;border-color:#8a2626 !important;background:#3a141466}
.rsb-none{color:#aebccb;border-color:#3c4d60 !important;background:#1a2a3b66}
`;
