import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const types = await ctx.db
      .query("involvementTypes")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    types.sort((a, b) => a.order - b.order);
    return types;
  },
});

export const create = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, { projectId, name }) => {
    const existing = await ctx.db
      .query("involvementTypes")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("involvementTypes", {
      projectId, name, order: existing.length, createdAt: now, updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("involvementTypes") },
  handler: async (ctx, { id }) => { await ctx.db.delete(id); },
});

export const bulkImport = mutation({
  args: {
    projectId: v.id("projects"),
    rows: v.array(v.object({ name: v.string() })),
    mode: v.union(v.literal("append"), v.literal("replace")),
  },
  handler: async (ctx, { projectId, rows, mode }) => {
    const now = Date.now();
    if (mode === "replace") {
      const existing = await ctx.db
        .query("involvementTypes")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
      for (let i = 0; i < rows.length; i++) {
        await ctx.db.insert("involvementTypes", { projectId, ...rows[i], order: i, createdAt: now, updatedAt: now });
      }
    } else {
      const existing = await ctx.db
        .query("involvementTypes")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));
      let order = existing.length;
      for (const row of rows) {
        if (existingNames.has(row.name.toLowerCase())) continue;
        await ctx.db.insert("involvementTypes", { projectId, ...row, order: order++, createdAt: now, updatedAt: now });
      }
    }
  },
});
