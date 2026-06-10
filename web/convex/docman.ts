import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const LEVEL_VALIDATOR = v.union(
  v.literal("Relationships"),
  v.literal("Loans"),
  v.literal("Collateral"),
  v.literal("Product Package"),
);

// ── Queries ───────────────────────────────────────────────────────────────────

// Returns all docmanPlaceholders across every docman card for a project.
// Used by the Smart Checklist builder to populate the placeholder dropdown.
export const listPlaceholdersForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const heatmaps = await ctx.db
      .query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();

    const results: Array<{ _id: string; name: string; level: string }> = [];
    for (const hm of heatmaps) {
      const phases = await ctx.db
        .query("phases")
        .withIndex("byHeatmap", (q) => q.eq("heatmapId", hm._id))
        .collect();
      for (const phase of phases) {
        const subphases = await ctx.db
          .query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id))
          .collect();
        for (const sp of subphases) {
          const cards = await ctx.db
            .query("cards")
            .withIndex("bySubphase", (q) => q.eq("subphaseId", sp._id))
            .collect();
          for (const card of cards) {
            if (card.configuratorKind !== "docman") continue;
            const phs = await ctx.db
              .query("docmanPlaceholders")
              .withIndex("byCard", (q) => q.eq("cardId", card._id))
              .collect();
            for (const p of phs) {
              results.push({ _id: p._id, name: p.name, level: p.level });
            }
          }
        }
      }
    }
    return results;
  },
});

export const listForCard = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const groups = await ctx.db
      .query("docmanGroups")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    groups.sort((a, b) => a.order - b.order);

    const placeholders = await ctx.db
      .query("docmanPlaceholders")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    placeholders.sort((a, b) => a.order - b.order);

    return { groups, placeholders };
  },
});

// ── Groups ────────────────────────────────────────────────────────────────────

export const createGroup = mutation({
  args: {
    cardId: v.id("cards"),
    level: LEVEL_VALIDATOR,
    name: v.string(),
  },
  handler: async (ctx, { cardId, level, name }) => {
    const siblings = await ctx.db
      .query("docmanGroups")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    return await ctx.db.insert("docmanGroups", {
      cardId,
      level,
      name,
      placeholderIds: [],
      order: siblings.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateGroup = mutation({
  args: {
    id: v.id("docmanGroups"),
    name: v.optional(v.string()),
    criteriaUserWritten: v.optional(v.string()),
    criteriaFormgen: v.optional(v.string()),
    placeholderIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteGroup = mutation({
  args: { id: v.id("docmanGroups") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ── Placeholders ──────────────────────────────────────────────────────────────

export const createPlaceholder = mutation({
  args: {
    cardId: v.id("cards"),
    name: v.string(),
    level: LEVEL_VALIDATOR,
    category: v.optional(v.string()),
  },
  handler: async (ctx, { cardId, name, level, category }) => {
    const siblings = await ctx.db
      .query("docmanPlaceholders")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    return await ctx.db.insert("docmanPlaceholders", {
      cardId,
      name,
      level,
      category,
      order: siblings.length,
      createdAt: Date.now(),
    });
  },
});

export const updatePlaceholder = mutation({
  args: {
    id: v.id("docmanPlaceholders"),
    name: v.optional(v.string()),
    level: v.optional(LEVEL_VALIDATOR),
    category: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deletePlaceholder = mutation({
  args: { id: v.id("docmanPlaceholders") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ── Sync from Checklist import ────────────────────────────────────────────────
// Called after a checklist import. For each placeholder name, finds the docman
// card(s) for the project, and inserts the placeholder if it doesn't exist yet.
export const syncFromChecklist = mutation({
  args: {
    projectId: v.id("projects"),
    placeholders: v.array(
      v.object({
        name: v.string(),
        level: v.union(v.literal("Loans"), v.literal("Relationships")),
      }),
    ),
  },
  handler: async (ctx, { projectId, placeholders }) => {
    if (!placeholders.length) return;

    // Find all cards with configuratorKind === "docman" for this project by
    // walking project → heatmaps → phases → subphases → cards.
    const heatmaps = await ctx.db
      .query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();

    const docmanCardIds: Id<"cards">[] = [];
    for (const hm of heatmaps) {
      const phases = await ctx.db
        .query("phases")
        .withIndex("byHeatmap", (q) => q.eq("heatmapId", hm._id))
        .collect();
      for (const phase of phases) {
        const subphases = await ctx.db
          .query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id))
          .collect();
        for (const sp of subphases) {
          const cards = await ctx.db
            .query("cards")
            .withIndex("bySubphase", (q) => q.eq("subphaseId", sp._id))
            .collect();
          for (const card of cards) {
            if (card.configuratorKind === "docman") {
              docmanCardIds.push(card._id);
            }
          }
        }
      }
    }

    if (!docmanCardIds.length) return;

    const now = Date.now();

    for (const cardId of docmanCardIds) {
      // Load existing placeholders for this card once
      const existing = await ctx.db
        .query("docmanPlaceholders")
        .withIndex("byCard", (q) => q.eq("cardId", cardId))
        .collect();

      for (const { name, level } of placeholders) {
        const alreadyExists = existing.some(
          (p) => p.name === name && p.level === level,
        );
        if (alreadyExists) continue;

        const order = existing.length;
        const id = await ctx.db.insert("docmanPlaceholders", {
          cardId,
          name,
          level,
          category: "No category",
          fromChecklist: true,
          order,
          createdAt: now,
        });
        // Keep local list in sync so duplicate detection works within the loop
        existing.push({
          _id: id,
          _creationTime: now,
          cardId,
          name,
          level,
          category: "No category",
          fromChecklist: true,
          order,
          createdAt: now,
        });
      }
    }
  },
});

// ── Bulk import ───────────────────────────────────────────────────────────────

export const bulkImport = mutation({
  args: {
    cardId: v.id("cards"),
    mode: v.union(v.literal("replace"), v.literal("append")),
    placeholders: v.array(
      v.object({
        name: v.string(),
        level: LEVEL_VALIDATOR,
        category: v.optional(v.string()),
        isDefault: v.optional(v.boolean()),
      }),
    ),
    groups: v.array(
      v.object({
        name: v.string(),
        level: LEVEL_VALIDATOR,
        criteriaUserWritten: v.optional(v.string()),
        criteriaFormgen: v.optional(v.string()),
        // placeholder names — resolved to IDs after placeholders are inserted
        placeholderNames: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, { cardId, mode, placeholders, groups }) => {
    if (mode === "replace") {
      const existingPhs = await ctx.db
        .query("docmanPlaceholders")
        .withIndex("byCard", (q) => q.eq("cardId", cardId))
        .collect();
      for (const p of existingPhs) await ctx.db.delete(p._id);
      const existingGrps = await ctx.db
        .query("docmanGroups")
        .withIndex("byCard", (q) => q.eq("cardId", cardId))
        .collect();
      for (const g of existingGrps) await ctx.db.delete(g._id);
    }

    const now = Date.now();

    // Insert placeholders and build name→id map for group resolution
    const nameToId = new Map<string, string>();
    for (let i = 0; i < placeholders.length; i++) {
      const p = placeholders[i];
      const id = await ctx.db.insert("docmanPlaceholders", {
        cardId,
        name: p.name,
        level: p.level,
        category: p.category,
        isDefault: p.isDefault,
        order: i,
        createdAt: now,
      });
      nameToId.set(p.name, id);
    }

    // Insert groups, resolving placeholder names to IDs
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const placeholderIds = g.placeholderNames
        .map((n) => nameToId.get(n))
        .filter((id): id is string => id !== undefined);
      await ctx.db.insert("docmanGroups", {
        cardId,
        name: g.name,
        level: g.level,
        criteriaUserWritten: g.criteriaUserWritten,
        criteriaFormgen: g.criteriaFormgen,
        placeholderIds,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
