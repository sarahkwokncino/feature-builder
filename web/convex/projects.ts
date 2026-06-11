import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { SEED_PHASES } from "./seedData";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    customer: v.optional(v.string()),
    region: v.optional(v.string()),
  },
  handler: async (ctx, { name, customer, region }) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name,
      customer,
      region,
      createdAt: now,
    });

    const heatmapId = await ctx.db.insert("heatmaps", {
      projectId,
      name: "Default",
      version: 1,
      createdAt: now,
    });

    for (let p = 0; p < SEED_PHASES.length; p++) {
      const phase = SEED_PHASES[p];
      const phaseId = await ctx.db.insert("phases", {
        heatmapId,
        name: phase.name,
        order: p,
      });
      for (let s = 0; s < phase.subphases.length; s++) {
        const sub = phase.subphases[s];
        const subphaseId = await ctx.db.insert("subphases", {
          phaseId,
          name: sub.name,
          order: s,
        });
        for (let c = 0; c < sub.cards.length; c++) {
          const card = sub.cards[c];
          await ctx.db.insert("cards", {
            subphaseId,
            name: card.name,
            sub: card.sub || undefined,
            type: card.type,
            status: card.type === "linked" ? "linked" : "not-configured",
            order: c,
            featureId: card.featureId,
            configuratorKind: card.configuratorKind,
          });
        }
      }
    }

    return projectId;
  },
});

export const reseedHeatmap = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const now = Date.now();
    const heatmaps = await ctx.db
      .query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    for (const heatmap of heatmaps) {
      const phases = await ctx.db
        .query("phases")
        .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmap._id))
        .collect();
      for (const phase of phases) {
        const subs = await ctx.db
          .query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id))
          .collect();
        for (const sub of subs) {
          const cards = await ctx.db
            .query("cards")
            .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id))
            .collect();
          for (const card of cards) await ctx.db.delete(card._id);
          await ctx.db.delete(sub._id);
        }
        await ctx.db.delete(phase._id);
      }
    }
    // Use the first heatmap, or create one
    let heatmapId = heatmaps[0]?._id;
    if (!heatmapId) {
      heatmapId = await ctx.db.insert("heatmaps", {
        projectId, name: "Default", version: 1, createdAt: now,
      });
    }
    for (let p = 0; p < SEED_PHASES.length; p++) {
      const phase = SEED_PHASES[p];
      const phaseId = await ctx.db.insert("phases", {
        heatmapId, name: phase.name, order: p,
      });
      for (let s = 0; s < phase.subphases.length; s++) {
        const sub = phase.subphases[s];
        const subphaseId = await ctx.db.insert("subphases", {
          phaseId, name: sub.name, order: s,
        });
        for (let c = 0; c < sub.cards.length; c++) {
          const card = sub.cards[c];
          await ctx.db.insert("cards", {
            subphaseId,
            name: card.name,
            sub: card.sub || undefined,
            type: card.type,
            status: card.type === "linked" ? "linked" : "not-configured",
            order: c,
            featureId: card.featureId,
            configuratorKind: card.configuratorKind,
          });
        }
      }
    }
  },
});

export const rename = mutation({
  args: { id: v.id("projects"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name });
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    // Cascade delete: heatmaps → phases → subphases → cards (+ configurators)
    const heatmaps = await ctx.db
      .query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", id))
      .collect();
    for (const heatmap of heatmaps) {
      const phases = await ctx.db
        .query("phases")
        .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmap._id))
        .collect();
      for (const phase of phases) {
        const subs = await ctx.db
          .query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id))
          .collect();
        for (const sub of subs) {
          const cards = await ctx.db
            .query("cards")
            .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id))
            .collect();
          for (const card of cards) {
            // Remove any per-card configurator rows
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
        await ctx.db.delete(phase._id);
      }
      await ctx.db.delete(heatmap._id);
    }
    await ctx.db.delete(id);
  },
});
