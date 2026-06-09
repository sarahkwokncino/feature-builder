import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const roles = await ctx.db
      .query("connectionRoles")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    roles.sort((a, b) => a.order - b.order);
    return roles;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    fromType: v.optional(v.string()),
    toType: v.optional(v.string()),
    description: v.optional(v.string()),
    selfReciprocating: v.optional(v.boolean()),
    reciprocalRole: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, name, fromType, toType, description, selfReciprocating, reciprocalRole }) => {
    const existing = await ctx.db
      .query("connectionRoles")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("connectionRoles", {
      projectId,
      name,
      fromType,
      toType,
      description,
      selfReciprocating,
      reciprocalRole,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("connectionRoles"),
    name: v.optional(v.string()),
    fromType: v.optional(v.string()),
    toType: v.optional(v.string()),
    description: v.optional(v.string()),
    selfReciprocating: v.optional(v.boolean()),
    reciprocalRole: v.optional(v.string()),
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
  args: { id: v.id("connectionRoles") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: { projectId: v.id("projects"), ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    for (let i = 0; i < ids.length; i++) {
      await ctx.db.patch(ids[i] as Id<"connectionRoles">, { order: i, updatedAt: now });
    }
  },
});

export const bulkImport = mutation({
  args: {
    projectId: v.id("projects"),
    rows: v.array(v.object({
      name: v.string(),
      fromType: v.optional(v.string()),
      toType: v.optional(v.string()),
      description: v.optional(v.string()),
      selfReciprocating: v.optional(v.boolean()),
      reciprocalRole: v.optional(v.string()),
    })),
    mode: v.union(v.literal("append"), v.literal("replace")),
  },
  handler: async (ctx, { projectId, rows, mode }) => {
    const now = Date.now();
    if (mode === "replace") {
      const existing = await ctx.db
        .query("connectionRoles")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
      for (let i = 0; i < rows.length; i++) {
        await ctx.db.insert("connectionRoles", { projectId, ...rows[i], order: i, createdAt: now, updatedAt: now });
      }
    } else {
      const existing = await ctx.db
        .query("connectionRoles")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));
      let order = existing.length;
      for (const row of rows) {
        if (existingNames.has(row.name.toLowerCase())) continue;
        await ctx.db.insert("connectionRoles", { projectId, ...row, order: order++, createdAt: now, updatedAt: now });
      }
    }
  },
});
