import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const sectionValidator = v.object({
  id: v.string(),
  name: v.string(),
  fields: v.array(v.object({ name: v.string(), fieldType: v.string(), picklistValues: v.optional(v.array(v.string())) })),
});

const linkedToValidator = v.optional(v.object({
  collateralType: v.string(),
  collateralSubtype: v.string(),
}));

export const getFieldConfig = query({
  args: {
    projectId: v.id("projects"),
    collateralType: v.string(),
    collateralSubtype: v.string(),
  },
  handler: async (ctx, { projectId, collateralType, collateralSubtype }) => {
    return await ctx.db
      .query("collateralFieldConfigs")
      .withIndex("byProjectTypeSubtype", (q) =>
        q.eq("projectId", projectId).eq("collateralType", collateralType).eq("collateralSubtype", collateralSubtype),
      )
      .first();
  },
});

export const listFieldConfigs = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("collateralFieldConfigs")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

export const saveFieldConfig = mutation({
  args: {
    projectId: v.id("projects"),
    collateralType: v.string(),
    collateralSubtype: v.string(),
    sections: v.array(sectionValidator),
    linkedTo: linkedToValidator,
  },
  handler: async (ctx, { projectId, collateralType, collateralSubtype, sections, linkedTo }) => {
    const existing = await ctx.db
      .query("collateralFieldConfigs")
      .withIndex("byProjectTypeSubtype", (q) =>
        q.eq("projectId", projectId).eq("collateralType", collateralType).eq("collateralSubtype", collateralSubtype),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { sections, linkedTo, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("collateralFieldConfigs", {
        projectId,
        collateralType,
        collateralSubtype,
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
    collateralType: v.string(),
    collateralSubtype: v.string(),
    linkedTo: linkedToValidator,
  },
  handler: async (ctx, { projectId, collateralType, collateralSubtype, linkedTo }) => {
    const existing = await ctx.db
      .query("collateralFieldConfigs")
      .withIndex("byProjectTypeSubtype", (q) =>
        q.eq("projectId", projectId).eq("collateralType", collateralType).eq("collateralSubtype", collateralSubtype),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { linkedTo, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("collateralFieldConfigs", {
        projectId,
        collateralType,
        collateralSubtype,
        sections: [],
        linkedTo,
        updatedAt: Date.now(),
      });
    }
  },
});
