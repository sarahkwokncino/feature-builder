import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const records = await ctx.db
      .query("fees")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    records.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return records;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, { projectId, name }) => {
    const existing = await ctx.db
      .query("fees")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    const maxOrder = existing.reduce((m, r) => Math.max(m, r.order), -1);
    const now = Date.now();
    return await ctx.db.insert("fees", {
      projectId,
      name,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("fees"),
    name: v.optional(v.string()),
    feePaidBy: v.optional(v.string()),
    calculationType: v.optional(v.union(v.literal("Flat Amount"), v.literal("Percentage"))),
    basisSource: v.optional(v.string()),
    percentage: v.optional(v.number()),
    amount: v.optional(v.number()),
    collectionMethod: v.optional(v.string()),
    autoApply: v.optional(v.boolean()),
    appliedToProducts: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("fees") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const bulkImport = mutation({
  args: {
    projectId: v.id("projects"),
    mode: v.union(v.literal("replace"), v.literal("append")),
    records: v.array(
      v.object({
        name: v.string(),
        feePaidBy: v.optional(v.string()),
        calculationType: v.optional(v.union(v.literal("Flat Amount"), v.literal("Percentage"))),
        basisSource: v.optional(v.string()),
        percentage: v.optional(v.number()),
        amount: v.optional(v.number()),
        collectionMethod: v.optional(v.string()),
        autoApply: v.optional(v.boolean()),
        appliedToProducts: v.optional(v.array(v.string())),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { projectId, mode, records }) => {
    if (mode === "replace") {
      const existing = await ctx.db
        .query("fees")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
    }
    const existing = await ctx.db
      .query("fees")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    const maxOrder = existing.reduce((m, r) => Math.max(m, r.order), -1);
    const now = Date.now();
    for (let i = 0; i < records.length; i++) {
      await ctx.db.insert("fees", {
        projectId,
        ...records[i],
        order: maxOrder + 1 + i,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const reorder = mutation({
  args: {
    projectId: v.id("projects"),
    ids: v.array(v.string()),
  },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    for (let i = 0; i < ids.length; i++) {
      await ctx.db.patch(ids[i] as Id<"fees">, {
        order: i,
        updatedAt: now,
      });
    }
  },
});
