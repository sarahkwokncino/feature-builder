import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const sectionValidator = v.object({
  id: v.string(),
  name: v.string(),
  fields: v.array(v.object({ name: v.string(), fieldType: v.string(), picklistValues: v.optional(v.array(v.string())) })),
});

const linkedToValidator = v.optional(v.object({
  relationshipType: v.string(),
}));

export const getFieldConfig = query({
  args: {
    projectId: v.id("projects"),
    relationshipType: v.string(),
  },
  handler: async (ctx, { projectId, relationshipType }) => {
    return await ctx.db
      .query("relationshipFieldConfigs")
      .withIndex("byProjectType", (q) =>
        q.eq("projectId", projectId).eq("relationshipType", relationshipType),
      )
      .first();
  },
});

export const listFieldConfigs = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("relationshipFieldConfigs")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

export const saveFieldConfig = mutation({
  args: {
    projectId: v.id("projects"),
    relationshipType: v.string(),
    sections: v.array(sectionValidator),
    linkedTo: linkedToValidator,
  },
  handler: async (ctx, { projectId, relationshipType, sections, linkedTo }) => {
    const existing = await ctx.db
      .query("relationshipFieldConfigs")
      .withIndex("byProjectType", (q) =>
        q.eq("projectId", projectId).eq("relationshipType", relationshipType),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { sections, linkedTo, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("relationshipFieldConfigs", {
        projectId,
        relationshipType,
        sections,
        linkedTo,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setLinkedTo = mutation({
  args: {
    projectId: v.id("projects"),
    relationshipType: v.string(),
    linkedTo: linkedToValidator,
  },
  handler: async (ctx, { projectId, relationshipType, linkedTo }) => {
    const existing = await ctx.db
      .query("relationshipFieldConfigs")
      .withIndex("byProjectType", (q) =>
        q.eq("projectId", projectId).eq("relationshipType", relationshipType),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { linkedTo, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("relationshipFieldConfigs", {
        projectId,
        relationshipType,
        sections: [],
        linkedTo,
        updatedAt: Date.now(),
      });
    }
  },
});
