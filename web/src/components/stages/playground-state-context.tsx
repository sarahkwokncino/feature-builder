"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// ── Types matching each playground's added-item shape ────────────────────────

export type SharedPreviewFee = {
  id: string;
  name: string;
  feePaidBy?: string;
  calculationType?: string;
  basisSource?: string;
  percentage?: number;
  amount?: number;
  collectionMethod?: string;
  autoApply?: boolean;
  overrideAmount?: string;
};

export type SharedPreviewCondition = {
  id: string;
  name: string;
  description?: string;
  taskType?: string;
  category?: string;
  conditionType: string;
};

export type SharedPreviewException = {
  id: string;
  type: string;
  name: string;
  severities: string[];
  mitigationReasons: { reason: string; commentRequired: boolean }[];
  selectedSeverity: string;
  selectedReasons: string[];
  comment: string;
};

// ── Context shape ─────────────────────────────────────────────────────────────

type PlaygroundState = {
  addedFees: SharedPreviewFee[];
  setAddedFees: React.Dispatch<React.SetStateAction<SharedPreviewFee[]>>;
  addedConditions: SharedPreviewCondition[];
  setAddedConditions: React.Dispatch<React.SetStateAction<SharedPreviewCondition[]>>;
  addedExceptions: SharedPreviewException[];
  setAddedExceptions: React.Dispatch<React.SetStateAction<SharedPreviewException[]>>;
};

const PlaygroundStateContext = createContext<PlaygroundState | null>(null);

export function PlaygroundStateProvider({ children }: { children: ReactNode }) {
  const [addedFees, setAddedFees] = useState<SharedPreviewFee[]>([]);
  const [addedConditions, setAddedConditions] = useState<SharedPreviewCondition[]>([]);
  const [addedExceptions, setAddedExceptions] = useState<SharedPreviewException[]>([]);

  return (
    <PlaygroundStateContext value={{
      addedFees, setAddedFees,
      addedConditions, setAddedConditions,
      addedExceptions, setAddedExceptions,
    }}>
      {children}
    </PlaygroundStateContext>
  );
}

export function usePlaygroundState() {
  const ctx = useContext(PlaygroundStateContext);
  if (!ctx) throw new Error("usePlaygroundState must be used inside PlaygroundStateProvider");
  return ctx;
}
