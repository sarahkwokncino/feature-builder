// Maps a card's `configuratorKind` to a route. New configurators are added by
// dropping a new entry here + a Convex table + a Next.js route.
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export type ConfiguratorKind = NonNullable<Doc<"cards">["configuratorKind"]>;

export function configuratorRoute(
  card: Doc<"cards">,
  projectId: Id<"projects">,
): string | null {
  if (card.sub === "Relationship" || card.sub === "Connections") return `/projects/${projectId}/relationships`;
  if (card.sub?.toLowerCase() === "smart checklist") return `/projects/${projectId}/checklist?cardId=${card._id}`;
  if (card.sub === "Conditions") return `/projects/${projectId}/conditions`;
  if (card.sub === "Collateral") return `/projects/${projectId}/collateral`;
  if (card.sub === "Policy Exceptions" || card.sub === "Policy Exception") return `/projects/${projectId}/policy-exceptions`;
  if (card.sub === "Covenants" || card.sub === "Covenant Mgmt" || card.sub === "Covenant Management") return `/projects/${projectId}/covenants`;
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
    case "conditions":
      return `/projects/${projectId}/conditions?cardId=${card._id}`;
    case "policy-exceptions":
      return `/projects/${projectId}/policy-exceptions`;
  }
}
