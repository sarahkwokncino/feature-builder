import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForCard = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const records = await ctx.db
      .query("checklistReqs")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    records.sort((a, b) => a.createdAt - b.createdAt);
    return records;
  },
});

export const create = mutation({
  args: {
    cardId: v.id("cards"),
    name: v.string(),
  },
  handler: async (ctx, { cardId, name }) => {
    const now = Date.now();
    return await ctx.db.insert("checklistReqs", {
      cardId,
      name,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("checklistReqs"),
    name: v.optional(v.string()),
    taskType: v.optional(v.string()),
    category: v.optional(v.string()),
    assignedParty: v.optional(v.string()),
    approvalProcess: v.optional(v.string()),
    requirementType: v.optional(v.string()),
    neededBy: v.optional(v.string()),
    description: v.optional(v.string()),
    placeholders: v.optional(v.array(v.string())),
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
  args: { id: v.id("checklistReqs") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
