import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Returns the cardId of the project-level checklist card, creating one if needed.
export const ensureProjectChecklistCard = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Id<"cards">> => {
    // Look for an existing checklist card in this project
    const heatmaps = await ctx.db.query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", projectId)).collect();
    for (const heatmap of heatmaps) {
      const phases = await ctx.db.query("phases")
        .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmap._id)).collect();
      for (const phase of phases) {
        const subphases = await ctx.db.query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id)).collect();
        for (const sub of subphases) {
          const cards = await ctx.db.query("cards")
            .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id)).collect();
          for (const card of cards) {
            if (
              card.configuratorKind === "checklist" ||
              card.sub?.toLowerCase() === "smart checklist"
            ) {
              return card._id;
            }
          }
        }
      }
    }
    // None found — create a virtual card on the first subphase
    const heatmap = heatmaps[0];
    if (!heatmap) throw new Error("No heatmap found for project");
    const phases = await ctx.db.query("phases")
      .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmap._id)).collect();
    const phase = phases[0];
    if (!phase) throw new Error("No phase found");
    const subphases = await ctx.db.query("subphases")
      .withIndex("byPhase", (q) => q.eq("phaseId", phase._id)).collect();
    const sub = subphases[0];
    if (!sub) throw new Error("No subphase found");
    const order = (await ctx.db.query("cards")
      .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id)).collect()).length;
    return await ctx.db.insert("cards", {
      subphaseId: sub._id,
      name: "Smart Checklist",
      sub: "Smart Checklist",
      type: "linked",
      status: "linked",
      configuratorKind: "checklist",
      order,
    });
  },
});

export const recoverOrphanedReqs = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<number> => {
    // Find the live checklist card for this project
    const heatmaps = await ctx.db.query("heatmaps")
      .withIndex("byProject", (q) => q.eq("projectId", projectId)).collect();
    let liveCardId: Id<"cards"> | null = null;
    outer: for (const heatmap of heatmaps) {
      const phases = await ctx.db.query("phases")
        .withIndex("byHeatmap", (q) => q.eq("heatmapId", heatmap._id)).collect();
      for (const phase of phases) {
        const subs = await ctx.db.query("subphases")
          .withIndex("byPhase", (q) => q.eq("phaseId", phase._id)).collect();
        for (const sub of subs) {
          const cards = await ctx.db.query("cards")
            .withIndex("bySubphase", (q) => q.eq("subphaseId", sub._id)).collect();
          for (const card of cards) {
            if (card.configuratorKind === "checklist" || card.sub?.toLowerCase() === "smart checklist") {
              liveCardId = card._id;
              break outer;
            }
          }
        }
      }
    }
    if (!liveCardId) return 0;

    // Scan all checklistReqs and re-link any whose card no longer exists
    const all = await ctx.db.query("checklistReqs").collect();
    let recovered = 0;
    for (const req of all) {
      if (req.cardId === liveCardId) continue; // already on the live card
      const card = await ctx.db.get(req.cardId);
      if (!card) {
        // Orphaned — re-link to the live card
        await ctx.db.patch(req._id, { cardId: liveCardId });
        recovered++;
      }
    }
    return recovered;
  },
});

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
