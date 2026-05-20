import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const heatmap = await ctx.db
      .query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .first();
    if (!heatmap) return null;

    const phases = await ctx.db
      .query("phases")
      .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmap._id))
      .collect();
    phases.sort((a, b) => a.order - b.order);

    const result = await Promise.all(
      phases.map(async (phase) => {
        const subphases = await ctx.db
          .query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id))
          .collect();
        subphases.sort((a, b) => a.order - b.order);

        const subphasesWithCards = await Promise.all(
          subphases.map(async (sub) => {
            const cards = await ctx.db
              .query("cards")
              .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id))
              .collect();
            cards.sort((a, b) => a.order - b.order);
            return { ...sub, cards };
          }),
        );

        return { ...phase, subphases: subphasesWithCards };
      }),
    );

    return { heatmap, phases: result };
  },
});

// ── Card mutations ───────────────────────────────────────────────────────────
export const moveCard = mutation({
  args: {
    cardId: v.id("cards"),
    targetSubphaseId: v.id("subphases"),
    targetIndex: v.number(),
  },
  handler: async (ctx, { cardId, targetSubphaseId, targetIndex }) => {
    const card = await ctx.db.get(cardId);
    if (!card) return;

    if (card.subphaseId === targetSubphaseId) {
      // Reorder within the same subphase
      const siblings = await ctx.db
        .query("cards")
        .withIndex("bySubphase", (q) => q.eq("subphaseId", targetSubphaseId))
        .collect();
      siblings.sort((a, b) => a.order - b.order);
      const without = siblings.filter((c) => c._id !== cardId);
      const reordered = [
        ...without.slice(0, targetIndex),
        card,
        ...without.slice(targetIndex),
      ];
      for (let i = 0; i < reordered.length; i++) {
        await ctx.db.patch(reordered[i]._id, { order: i });
      }
    } else {
      // Move across subphases
      const targets = await ctx.db
        .query("cards")
        .withIndex("bySubphase", (q) => q.eq("subphaseId", targetSubphaseId))
        .collect();
      targets.sort((a, b) => a.order - b.order);
      const inserted = [
        ...targets.slice(0, targetIndex),
        card,
        ...targets.slice(targetIndex),
      ];
      for (let i = 0; i < inserted.length; i++) {
        if (inserted[i]._id === cardId) {
          await ctx.db.patch(cardId, {
            subphaseId: targetSubphaseId,
            order: i,
          });
        } else {
          await ctx.db.patch(inserted[i]._id, { order: i });
        }
      }
      // Compact the source subphase
      const source = await ctx.db
        .query("cards")
        .withIndex("bySubphase", (q) => q.eq("subphaseId", card.subphaseId))
        .collect();
      source.sort((a, b) => a.order - b.order);
      for (let i = 0; i < source.length; i++) {
        await ctx.db.patch(source[i]._id, { order: i });
      }
    }
  },
});

export const createCard = mutation({
  args: {
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
    configuratorKind: v.optional(
      v.union(v.literal("covenants"), v.literal("checklist")),
    ),
  },
  handler: async (ctx, args) => {
    const siblings = await ctx.db
      .query("cards")
      .withIndex("bySubphase", (q) => q.eq("subphaseId", args.subphaseId))
      .collect();
    return await ctx.db.insert("cards", {
      subphaseId: args.subphaseId,
      name: args.name,
      sub: args.sub,
      type: args.type,
      status: args.type === "linked" ? "linked" : "not-configured",
      order: siblings.length,
      configuratorKind: args.configuratorKind,
    });
  },
});

export const updateCard = mutation({
  args: {
    id: v.id("cards"),
    name: v.optional(v.string()),
    sub: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("low"),
        v.literal("high"),
        v.literal("manual"),
        v.literal("custom"),
        v.literal("linked"),
      ),
    ),
    status: v.optional(
      v.union(
        v.literal("not-configured"),
        v.literal("configured"),
        v.literal("linked"),
      ),
    ),
    configuratorKind: v.optional(
      v.union(v.literal("covenants"), v.literal("checklist")),
    ),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteCard = mutation({
  args: { id: v.id("cards") },
  handler: async (ctx, { id }) => {
    const covs = await ctx.db
      .query("covenants")
      .withIndex("byCard", (q) => q.eq("cardId", id))
      .collect();
    for (const c of covs) await ctx.db.delete(c._id);
    const reqs = await ctx.db
      .query("checklistReqs")
      .withIndex("byCard", (q) => q.eq("cardId", id))
      .collect();
    for (const r of reqs) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
  },
});

// ── Subphase + phase mutations ───────────────────────────────────────────────
export const createSubphase = mutation({
  args: { phaseId: v.id("phases"), name: v.string() },
  handler: async (ctx, { phaseId, name }) => {
    const siblings = await ctx.db
      .query("subphases")
      .withIndex("byPhase", (q) => q.eq("phaseId", phaseId))
      .collect();
    return await ctx.db.insert("subphases", {
      phaseId,
      name,
      order: siblings.length,
    });
  },
});

export const renameSubphase = mutation({
  args: { id: v.id("subphases"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name });
  },
});

export const deleteSubphase = mutation({
  args: { id: v.id("subphases") },
  handler: async (ctx, { id }) => {
    const cards = await ctx.db
      .query("cards")
      .withIndex("bySubphase", (q) => q.eq("subphaseId", id))
      .collect();
    for (const card of cards) {
      const covs = await ctx.db
        .query("covenants")
        .withIndex("byCard", (q) => q.eq("cardId", card._id))
        .collect();
      for (const c of covs) await ctx.db.delete(c._id);
      const reqs = await ctx.db
        .query("checklistReqs")
        .withIndex("byCard", (q) => q.eq("cardId", card._id))
        .collect();
      for (const r of reqs) await ctx.db.delete(r._id);
      await ctx.db.delete(card._id);
    }
    await ctx.db.delete(id);
  },
});

export const createPhase = mutation({
  args: { heatmapId: v.id("heatmaps"), name: v.string() },
  handler: async (ctx, { heatmapId, name }) => {
    const siblings = await ctx.db
      .query("phases")
      .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmapId))
      .collect();
    return await ctx.db.insert("phases", {
      heatmapId,
      name,
      order: siblings.length,
    });
  },
});

export const renamePhase = mutation({
  args: { id: v.id("phases"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name });
  },
});

export const deletePhase = mutation({
  args: { id: v.id("phases") },
  handler: async (ctx, { id }) => {
    const subs = await ctx.db
      .query("subphases")
      .withIndex("byPhase", (q) => q.eq("phaseId", id))
      .collect();
    for (const sub of subs) {
      const cards = await ctx.db
        .query("cards")
        .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id))
        .collect();
      for (const card of cards) {
        const covs = await ctx.db
          .query("covenants")
          .withIndex("byCard", (q) => q.eq("cardId", card._id))
          .collect();
        for (const c of covs) await ctx.db.delete(c._id);
        const reqs = await ctx.db
          .query("checklistReqs")
          .withIndex("byCard", (q) => q.eq("cardId", card._id))
          .collect();
        for (const r of reqs) await ctx.db.delete(r._id);
        await ctx.db.delete(card._id);
      }
      await ctx.db.delete(sub._id);
    }
    await ctx.db.delete(id);
  },
});
