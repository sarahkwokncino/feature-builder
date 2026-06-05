// Maps a card's `configuratorKind` to a route. New configurators are added by
// dropping a new entry here + a Convex table + a Next.js route.
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export type ConfiguratorKind = NonNullable<Doc<"cards">["configuratorKind"]>;

export function configuratorRoute(
  card: Doc<"cards">,
  projectId: Id<"projects">,
): string | null {
  if (!card.configuratorKind) return null;
  switch (card.configuratorKind) {
    case "covenants":
      return `/projects/${projectId}/covenants?cardId=${card._id}`;
    case "checklist":
      return `/projects/${projectId}/checklist?cardId=${card._id}`;
    case "product-hierarchy":
      return `/projects/${projectId}/product-hierarchy`;
    case "docman":
      return `/projects/${projectId}/docman?cardId=${card._id}`;
    case "collateral":
      return `/projects/${projectId}/collateral`;
  }
}
