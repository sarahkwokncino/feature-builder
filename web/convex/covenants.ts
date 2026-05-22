import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForCard = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const records = await ctx.db
      .query("covenants")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    records.sort((a, b) => a.autoNum.localeCompare(b.autoNum));
    return records;
  },
});

function nextAutoNum(existing: { autoNum: string }[]): string {
  const maxN = existing.reduce((acc, r) => {
    const m = r.autoNum.match(/COV-(\d+)/);
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return `COV-${String(maxN + 1).padStart(6, "0")}`;
}

export const create = mutation({
  args: {
    cardId: v.id("cards"),
    name: v.string(),
    category: v.optional(v.string()),
    type: v.optional(v.string()),
    frequency: v.optional(v.string()),
    financialIndicator: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("covenants")
      .withIndex("byCard", (q) => q.eq("cardId", args.cardId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("covenants", {
      cardId: args.cardId,
      autoNum: nextAutoNum(existing),
      name: args.name,
      category: args.category,
      type: args.type,
      frequency: args.frequency,
      financialIndicator: args.financialIndicator,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("covenants"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    type: v.optional(v.string()),
    frequency: v.optional(v.string()),
    financialIndicator: v.optional(v.string()),
    description: v.optional(v.string()),
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
  args: { id: v.id("covenants") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const bulkImport = mutation({
  args: {
    cardId: v.id("cards"),
    mode: v.union(v.literal("replace"), v.literal("append")),
    records: v.array(
      v.object({
        name: v.string(),
        category: v.optional(v.string()),
        type: v.optional(v.string()),
        frequency: v.optional(v.string()),
        financialIndicator: v.optional(v.string()),
        description: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { cardId, mode, records }) => {
    if (mode === "replace") {
      const existing = await ctx.db
        .query("covenants")
        .withIndex("byCard", (q) => q.eq("cardId", cardId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
    }
    const allExisting = await ctx.db
      .query("covenants")
      .withIndex("byCard", (q) => q.eq("cardId", cardId))
      .collect();
    const now = Date.now();
    let counter = allExisting.reduce((acc, r) => {
      const m = r.autoNum.match(/COV-(\d+)/);
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 0);
    for (const rec of records) {
      counter++;
      await ctx.db.insert("covenants", {
        cardId,
        autoNum: `COV-${String(counter).padStart(6, "0")}`,
        ...rec,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
