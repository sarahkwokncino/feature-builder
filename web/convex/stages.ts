import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const FIXED_STAGES = ["Booked", "Complete"];

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const stages = await ctx.db
      .query("stages")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    stages.sort((a, b) => a.order - b.order);

    const sections = await ctx.db
      .query("stageSections")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    sections.sort((a, b) => a.order - b.order);

    return { stages, sections };
  },
});

export const seedDefaults = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const existing = await ctx.db
      .query("stages")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    if (existing.length === 0) {
      // Brand new project — seed stages and sections together (handled below)
    } else {
      // Stages exist — seed sections for any stage that has none
      const defaultSections = [
        "Borrowing Structure",
        "Security",
        "Covenants",
        "Conditions",
        "Fees",
        "Policy Exceptions",
      ];
      const now = Date.now();
      for (const stage of existing) {
        const stageSections = await ctx.db
          .query("stageSections")
          .withIndex("byStage", (q) => q.eq("stageId", stage._id))
          .collect();
        if (stageSections.length === 0) {
          for (let j = 0; j < defaultSections.length; j++) {
            await ctx.db.insert("stageSections", {
              stageId: stage._id,
              projectId,
              name: defaultSections[j],
              isDefault: true,
              order: j,
              createdAt: now,
              updatedAt: now,
            });
          }
        } else {
          // Backfill isDefault on any existing section whose name matches a default
          for (const s of stageSections) {
            if (defaultSections.includes(s.name) && !s.isDefault) {
              await ctx.db.patch(s._id, { isDefault: true });
            }
          }
        }
      }
      return;
    }

    const defaultStages = [
      "Eligibility Assessment",
      "Full Application",
      "Loan Packaging",
      "Credit Underwriting",
      "Approval / Loan Committee",
      "Doc Prep",
      "Booked",
      "Complete",
    ];
    const defaultSections = [
      "Borrowing Structure",
      "Security",
      "Covenants",
      "Conditions",
      "Fees",
      "Policy Exceptions",
    ];
    const now = Date.now();
    for (let i = 0; i < defaultStages.length; i++) {
      const stageId = await ctx.db.insert("stages", {
        projectId,
        name: defaultStages[i],
        isFixed: FIXED_STAGES.includes(defaultStages[i]) ? true : undefined,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
      for (let j = 0; j < defaultSections.length; j++) {
        await ctx.db.insert("stageSections", {
          stageId,
          projectId,
          name: defaultSections[j],
          isDefault: true,
          order: j,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

export const createStage = mutation({
  args: { projectId: v.id("projects"), name: v.string(), insertAfterOrder: v.optional(v.number()) },
  handler: async (ctx, { projectId, name, insertAfterOrder }) => {
    const existing = await ctx.db
      .query("stages")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();

    // Insert before Booked/Complete (fixed stages always stay at end)
    const fixedStart = existing
      .filter((s) => s.isFixed)
      .reduce((min, s) => Math.min(min, s.order), Infinity);
    const insertOrder = insertAfterOrder !== undefined
      ? Math.min(insertAfterOrder + 0.5, fixedStart - 0.5)
      : fixedStart - 0.5;

    // Recompact orders
    const sorted = [...existing, { order: insertOrder, _placeholder: true }]
      .sort((a, b) => a.order - b.order);
    const now = Date.now();
    let newId: Id<"stages"> | null = null;
    let idx = 0;
    for (const s of sorted) {
      if ("_placeholder" in s) {
        newId = await ctx.db.insert("stages", {
          projectId,
          name,
          order: idx,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(s._id, { order: idx });
      }
      idx++;
    }
    return newId;
  },
});

export const updateStage = mutation({
  args: {
    id: v.id("stages"),
    name: v.optional(v.string()),
    keyFields: v.optional(v.array(v.string())),
    enabledTabs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const stage = await ctx.db.get(id);
    if (!stage) return;
    if (stage.isFixed && patch.name !== undefined) return; // cannot rename fixed stages
    const filtered: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteStage = mutation({
  args: { id: v.id("stages") },
  handler: async (ctx, { id }) => {
    const stage = await ctx.db.get(id);
    if (!stage || stage.isFixed) return;
    // Delete associated sections
    const sections = await ctx.db
      .query("stageSections")
      .withIndex("byStage", (q) => q.eq("stageId", id))
      .collect();
    for (const s of sections) await ctx.db.delete(s._id);
    await ctx.db.delete(id);
  },
});

export const reorderStages = mutation({
  args: { projectId: v.id("projects"), ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    for (let i = 0; i < ids.length; i++) {
      await ctx.db.patch(ids[i] as Id<"stages">, { order: i, updatedAt: now });
    }
  },
});

// ── Stage Sections ─────────────────────────────────────────────────────────────

export const createSection = mutation({
  args: { stageId: v.id("stages"), projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, { stageId, projectId, name }) => {
    const existing = await ctx.db
      .query("stageSections")
      .withIndex("byStage", (q) => q.eq("stageId", stageId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("stageSections", {
      stageId,
      projectId,
      name,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSection = mutation({
  args: {
    id: v.id("stageSections"),
    name: v.optional(v.string()),
    isHidden: v.optional(v.boolean()),
    description: v.optional(v.string()),
    subsections: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      fields: v.array(v.object({ id: v.string(), name: v.string(), fieldType: v.string() })),
      sections: v.optional(v.array(v.object({
        id: v.string(),
        name: v.string(),
        fields: v.array(v.object({ id: v.string(), name: v.string(), fieldType: v.string() })),
      }))),
    }))),
  },
  handler: async (ctx, { id, name, isHidden, description, subsections }) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    if (isHidden !== undefined) patch.isHidden = isHidden;
    if (description !== undefined) patch.description = description;
    if (subsections !== undefined) patch.subsections = subsections;
    await ctx.db.patch(id, patch);
  },
});

export const deleteSection = mutation({
  args: { id: v.id("stageSections") },
  handler: async (ctx, { id }) => {
    const section = await ctx.db.get(id);
    if (!section || section.isDefault) return; // default sections cannot be deleted
    await ctx.db.delete(id);
  },
});

export const reorderSections = mutation({
  args: { stageId: v.id("stages"), ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    for (let i = 0; i < ids.length; i++) {
      await ctx.db.patch(ids[i] as Id<"stageSections">, { order: i, updatedAt: now });
    }
  },
});

// ── Bulk import ────────────────────────────────────────────────────────────────

const stageImportRow = v.object({
  stageName: v.string(),
  sectionName: v.string(),
  isDefault: v.optional(v.boolean()),
  isHidden: v.optional(v.boolean()),
  description: v.optional(v.string()),
  subsections: v.optional(v.array(v.object({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    fields: v.array(v.object({ id: v.string(), name: v.string(), fieldType: v.string() })),
    sections: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      fields: v.array(v.object({ id: v.string(), name: v.string(), fieldType: v.string() })),
    }))),
  }))),
});

export const bulkImport = mutation({
  args: {
    projectId: v.id("projects"),
    rows: v.array(stageImportRow),
    mode: v.union(v.literal("append"), v.literal("replace")),
  },
  handler: async (ctx, { projectId, rows, mode }) => {
    const now = Date.now();
    const existingStages = await ctx.db
      .query("stages")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();

    for (const row of rows) {
      // Find or create the stage
      let stage = existingStages.find((s) => s.name === row.stageName);
      if (!stage) {
        const newId = await ctx.db.insert("stages", {
          projectId,
          name: row.stageName,
          order: existingStages.length,
          createdAt: now,
          updatedAt: now,
        });
        stage = (await ctx.db.get(newId))!;
        existingStages.push(stage);
      }

      // Find or create the section
      const existingSections = await ctx.db
        .query("stageSections")
        .withIndex("byStage", (q) => q.eq("stageId", stage!._id))
        .collect();

      const existing = existingSections.find((s) => s.name === row.sectionName);

      if (mode === "replace" && existing) {
        await ctx.db.patch(existing._id, {
          description: row.description,
          subsections: row.subsections,
          isHidden: row.isHidden,
          updatedAt: now,
        });
      } else if (!existing) {
        await ctx.db.insert("stageSections", {
          stageId: stage!._id,
          projectId,
          name: row.sectionName,
          isDefault: row.isDefault,
          isHidden: row.isHidden,
          description: row.description,
          subsections: row.subsections,
          order: existingSections.length,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});
