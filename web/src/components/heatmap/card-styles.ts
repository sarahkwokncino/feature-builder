// Visual styles per card type — ports the legacy Heatmap card colour scheme.
// type: 'low' | 'high' | 'manual' | 'custom' | 'linked'
export const CARD_TYPE_STYLES: Record<string, string> = {
  low: "bg-[var(--color-card-native-low)] text-slate-900",
  high: "bg-[var(--color-card-native-high)] text-slate-900",
  manual: "bg-[var(--color-card-manual)] text-slate-900",
  custom:
    "bg-[var(--color-card-custom-bg)] text-slate-900 border-l-4 border-l-[var(--color-card-custom-border)]",
  linked: "bg-[var(--color-card-native-low)] text-slate-900",
};

export const CARD_TYPE_LABELS: Record<string, string> = {
  low: "Native — Low Config",
  high: "Native — High Config",
  manual: "Manual",
  custom: "Custom",
  linked: "Linked Tool",
};
