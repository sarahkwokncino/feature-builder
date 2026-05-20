import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SCOPE = v.union(v.literal("covenants"), v.literal("checklist"));

export const listForScope = query({
  args: { scope: SCOPE },
  handler: async (ctx, { scope }) => {
    return await ctx.db
      .query("picklists")
      .withIndex("byScopeKey", (q) => q.eq("scope", scope))
      .collect();
  },
});

export const setValues = mutation({
  args: {
    scope: SCOPE,
    key: v.string(),
    values: v.array(v.string()),
  },
  handler: async (ctx, { scope, key, values }) => {
    const existing = await ctx.db
      .query("picklists")
      .withIndex("byScopeKey", (q) => q.eq("scope", scope).eq("key", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { values });
    } else {
      await ctx.db.insert("picklists", { scope, key, values });
    }
  },
});

export const addValue = mutation({
  args: { scope: SCOPE, key: v.string(), value: v.string() },
  handler: async (ctx, { scope, key, value }) => {
    const existing = await ctx.db
      .query("picklists")
      .withIndex("byScopeKey", (q) => q.eq("scope", scope).eq("key", key))
      .first();
    if (existing) {
      if (!existing.values.includes(value)) {
        await ctx.db.patch(existing._id, {
          values: [...existing.values, value],
        });
      }
    } else {
      await ctx.db.insert("picklists", { scope, key, values: [value] });
    }
  },
});

export const removeValue = mutation({
  args: { scope: SCOPE, key: v.string(), value: v.string() },
  handler: async (ctx, { scope, key, value }) => {
    const existing = await ctx.db
      .query("picklists")
      .withIndex("byScopeKey", (q) => q.eq("scope", scope).eq("key", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        values: existing.values.filter((v) => v !== value),
      });
    }
  },
});
