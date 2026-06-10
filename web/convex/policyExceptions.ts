import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const records = await ctx.db
      .query("policyExceptions")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    records.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return records;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { projectId, type, name }) => {
    // Determine next order value
    const existing = await ctx.db
      .query("policyExceptions")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    const maxOrder = existing.reduce((m, r) => Math.max(m, r.order), -1);
    const now = Date.now();
    return await ctx.db.insert("policyExceptions", {
      projectId,
      type,
      name,
      severities: [],
      mitigationReasons: [],
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("policyExceptions"),
    type: v.optional(v.string()),
    name: v.optional(v.string()),
    severities: v.optional(v.array(v.string())),
    mitigationReasons: v.optional(
      v.array(v.object({ reason: v.string(), commentRequired: v.boolean() })),
    ),
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
  args: { id: v.id("policyExceptions") },
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
        type: v.string(),
        name: v.string(),
        severities: v.array(v.string()),
        mitigationReasons: v.array(
          v.object({ reason: v.string(), commentRequired: v.boolean() }),
        ),
      }),
    ),
  },
  handler: async (ctx, { projectId, mode, records }) => {
    if (mode === "replace") {
      const existing = await ctx.db
        .query("policyExceptions")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
    }

    const now = Date.now();
    let startOrder = 0;
    if (mode === "append") {
      const existing = await ctx.db
        .query("policyExceptions")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      startOrder = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1;
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      await ctx.db.insert("policyExceptions", {
        projectId,
        type: r.type,
        name: r.name,
        severities: r.severities,
        mitigationReasons: r.mitigationReasons,
        order: startOrder + i,
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
      await ctx.db.patch(ids[i] as Id<"policyExceptions">, {
        order: i,
        updatedAt: now,
      });
    }
  },
});
