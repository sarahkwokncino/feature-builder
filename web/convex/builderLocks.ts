import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const locks = await ctx.db
      .query("builderLocks")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    return locks.map((l) => l.kind);
  },
});

export const lock = mutation({
  args: { projectId: v.id("projects"), kind: v.string() },
  handler: async (ctx, { projectId, kind }) => {
    const existing = await ctx.db
      .query("builderLocks")
      .withIndex("byProjectKind", (q) => q.eq("projectId", projectId).eq("kind", kind))
      .first();
    if (!existing) {
      await ctx.db.insert("builderLocks", { projectId, kind, lockedAt: Date.now() });
    }
  },
});

export const unlock = mutation({
  args: { projectId: v.id("projects"), kind: v.string() },
  handler: async (ctx, { projectId, kind }) => {
    const existing = await ctx.db
      .query("builderLocks")
      .withIndex("byProjectKind", (q) => q.eq("projectId", projectId).eq("kind", kind))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const lockMany = mutation({
  args: { projectId: v.id("projects"), kinds: v.array(v.string()) },
  handler: async (ctx, { projectId, kinds }) => {
    const now = Date.now();
    for (const kind of kinds) {
      const existing = await ctx.db
        .query("builderLocks")
        .withIndex("byProjectKind", (q) => q.eq("projectId", projectId).eq("kind", kind))
        .first();
      if (!existing) {
        await ctx.db.insert("builderLocks", { projectId, kind, lockedAt: now });
      }
    }
  },
});

export const unlockMany = mutation({
  args: { projectId: v.id("projects"), kinds: v.array(v.string()) },
  handler: async (ctx, { projectId, kinds }) => {
    for (const kind of kinds) {
      const existing = await ctx.db
        .query("builderLocks")
        .withIndex("byProjectKind", (q) => q.eq("projectId", projectId).eq("kind", kind))
        .first();
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});
