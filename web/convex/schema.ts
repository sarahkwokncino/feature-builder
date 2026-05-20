import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    customer: v.optional(v.string()),
    region: v.optional(v.string()),
    createdAt: v.number(),
  }),

  heatmaps: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    version: v.number(),
    createdAt: v.number(),
  }).index("byProject", ["projectId"]),

  phases: defineTable({
    heatmapId: v.id("heatmaps"),
    name: v.string(),
    order: v.number(),
  }).index("byHeatmap", ["heatmapId"]),

  subphases: defineTable({
    phaseId: v.id("phases"),
    name: v.string(),
    order: v.number(),
  }).index("byPhase", ["phaseId"]),

  cards: defineTable({
    subphaseId: v.id("subphases"),
    name: v.string(),
    sub: v.optional(v.string()),
    type: v.union(
      v.literal("low"),
      v.literal("high"),
      v.literal("manual"),
      v.literal("custom"),
      v.literal("linked"),
    ),
    status: v.union(
      v.literal("not-configured"),
      v.literal("configured"),
      v.literal("linked"),
    ),
    order: v.number(),
    // configRef points at a row in a per-type configurator table
    // (e.g. covenants, checklistReqs). Optional — many cards have no configurator.
    configuratorKind: v.optional(
      v.union(v.literal("covenants"), v.literal("checklist")),
    ),
  }).index("bySubphase", ["subphaseId"]),

  // ── Configurator tables ────────────────────────────────────────────────────
  // Covenants — ports localStorage keys covenant-type-builder-v1,
  // covenant-type-builder-picklists-v1, covenant-type-builder-cat-map-v1
  covenants: defineTable({
    cardId: v.id("cards"),
    autoNum: v.string(), // e.g. "COV-000001"
    name: v.string(),
    category: v.optional(v.string()),
    type: v.optional(v.string()),
    frequency: v.optional(v.string()),
    financialIndicator: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byCard", ["cardId"]),

  // Smart Checklist requirements — ports smart-checklist-builder-v1
  checklistReqs: defineTable({
    cardId: v.id("cards"),
    name: v.string(),
    taskType: v.optional(v.string()),
    category: v.optional(v.string()),
    assignedParty: v.optional(v.string()),
    approvalProcess: v.optional(v.string()),
    requirementType: v.optional(v.string()),
    neededBy: v.optional(v.string()),
    description: v.optional(v.string()),
    placeholders: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byCard", ["cardId"]),

  // Picklist values, scoped per configurator
  picklists: defineTable({
    scope: v.union(v.literal("covenants"), v.literal("checklist")),
    key: v.string(),
    values: v.array(v.string()),
  }).index("byScopeKey", ["scope", "key"]),
});
