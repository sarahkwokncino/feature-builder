import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const records = await ctx.db
      .query("conditionReqs")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    records.sort((a, b) => a.createdAt - b.createdAt);
    return records;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    conditionType: v.union(
      v.literal("Condition Precedent"),
      v.literal("Condition Subsequent"),
    ),
  },
  handler: async (ctx, { projectId, name, conditionType }) => {
    const now = Date.now();
    return await ctx.db.insert("conditionReqs", {
      projectId,
      name,
      conditionType,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("conditionReqs"),
    conditionType: v.optional(
      v.union(v.literal("Condition Precedent"), v.literal("Condition Subsequent")),
    ),
    name: v.optional(v.string()),
    taskType: v.optional(v.string()),
    category: v.optional(v.string()),
    assignedParty: v.optional(v.string()),
    description: v.optional(v.string()),
    legalDescription: v.optional(v.string()),
    stageCheck: v.optional(v.boolean()),
    doNotAutoGenerate: v.optional(v.boolean()),
    criteriaUserWritten: v.optional(v.string()),
    criteriaGenerated: v.optional(v.string()),
    placeholderName: v.optional(v.string()),
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
  args: { id: v.id("conditionReqs") },
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
        conditionType: v.union(
          v.literal("Condition Precedent"),
          v.literal("Condition Subsequent"),
        ),
        taskType: v.optional(v.string()),
        category: v.optional(v.string()),
        assignedParty: v.optional(v.string()),
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
  handler: async (ctx, { projectId, mode, records }) => {
    if (mode === "replace") {
      const existing = await ctx.db
        .query("conditionReqs")
        .withIndex("byProject", (q) => q.eq("projectId", projectId))
        .collect();
      for (const r of existing) await ctx.db.delete(r._id);
    }
    const now = Date.now();
    for (const rec of records) {
      await ctx.db.insert("conditionReqs", {
        projectId,
        ...rec,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
