// Visual styles per card type.
// All non-linked cards are dark grey. Linked cards (with a feature builder screen) are yellow.
export const CARD_TYPE_STYLES: Record<string, string> = {
  low: "bg-[var(--color-card-native-low)] text-white",
  high: "bg-[var(--color-card-native-high)] text-white",
  manual: "bg-[var(--color-card-manual)] text-white",
  custom: "bg-[var(--color-card-custom-bg)] text-white border-l-4 border-l-[var(--color-card-custom-border)]",
  linked: "bg-[var(--color-card-linked)] text-slate-900",
};

export const CARD_TYPE_LABELS: Record<string, string> = {
  low: "Native — Low Config",
  high: "Native — High Config",
  manual: "Manual",
  custom: "Custom",
  linked: "Linked Tool",
};
