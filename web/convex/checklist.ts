import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Doc<"checklistReqs">[]> => {
    const all: Doc<"checklistReqs">[] = [];
    const heatmaps = await ctx.db.query("heatmaps").filter((q) => q.eq(q.field("projectId"), projectId)).collect();
    for (const heatmap of heatmaps) {
      const phases = await ctx.db.query("phases").filter((q) => q.eq(q.field("heatmapId"), heatmap._id)).collect();
      for (const phase of phases) {
        const subphases = await ctx.db.query("subphases").filter((q) => q.eq(q.field("phaseId"), phase._id)).collect();
        for (const subphase of subphases) {
          const cards = await ctx.db.query("cards").filter((q) => q.eq(q.field("subphaseId"), subphase._id)).collect();
          for (const card of cards) {
            const reqs = await ctx.db.query("checklistReqs").withIndex("byCard", (q) => q.eq("cardId", card._id)).collect();
            all.push(...reqs);
          }
        }
      }
    }
    all.sort((a, b) => a.createdAt - b.createdAt);
    return all;
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
    checklistLevel: v.optional(v.union(v.literal("Loan"), v.literal("Relationship"))),
    name: v.optional(v.string()),
    taskType: v.optional(v.string()),
    category: v.optional(v.string()),
    assignedParty: v.optional(v.string()),
    approvalProcess: v.optional(v.string()),
    requirementType: v.optional(v.string()),
    neededBy: v.optional(v.string()),
    description: v.optional(v.string()),
    legalDescription: v.optional(v.string()),
    stageCheck: v.optional(v.boolean()),
    doNotAutoGenerate: v.optional(v.boolean()),
    criteriaUserWritten: v.optional(v.string()),
    criteriaGenerated: v.optional(v.string()),
    placeholderName: v.optional(v.string()),
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

export const bulkImport = mutation({
  args: {
    cardId: v.id("cards"),
    mode: v.union(v.literal("replace"), v.literal("append")),
    records: v.array(
      v.object({
        name: v.string(),
        checklistLevel: v.optional(v.union(v.literal("Loan"), v.literal("Relationship"))),
        category: v.optional(v.string()),
        assignedParty: v.optional(v.string()),
        approvalProcess: v.optional(v.string()),
        requirementType: v.optional(v.string()),
        neededBy: v.optional(v.string()),
        description: v.optional(v.string()),
        legalDescription: v.optional(v.string()),
        stageCheck: v.optional(v.boolean()),
        doNotAutoGenerate: v.optional(v.boolean()),
        criteriaUserWritten: v.optional(v.string()),
        criteriaGenerated: v.optional(v.string()),
        placeholderName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { cardId, mode, records }) => {
    if (mode === "replace") {
      const existing = await ctx.db
        .query("checklistReqs")
        .withIndex("byCard", (q) => q.eq("cardId", cardId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
    }
    const now = Date.now();
    for (const rec of records) {
      await ctx.db.insert("checklistReqs", {
        cardId,
        ...rec,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
