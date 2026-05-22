import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Queries ───────────────────────────────────────────────────────────────────

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const lines = await ctx.db
      .query("productLines")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    lines.sort((a, b) => a.order - b.order);

    const types = await ctx.db
      .query("productTypes")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    types.sort((a, b) => a.order - b.order);

    const products = await ctx.db
      .query("products")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    products.sort((a, b) => a.order - b.order);

    return { lines, types, products };
  },
});

// ── Product Lines ─────────────────────────────────────────────────────────────

export const createLine = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    productObject: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, name, productObject }) => {
    const existing = await ctx.db
      .query("productLines")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();
    return await ctx.db.insert("productLines", {
      projectId,
      name,
      productObject,
      order: existing.length,
      createdAt: Date.now(),
    });
  },
});

export const updateLine = mutation({
  args: {
    id: v.id("productLines"),
    name: v.optional(v.string()),
    productObject: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteLine = mutation({
  args: { id: v.id("productLines") },
  handler: async (ctx, { id }) => {
    const types = await ctx.db
      .query("productTypes")
      .withIndex("byProductLine", (q) => q.eq("productLineId", id))
      .collect();
    for (const t of types) {
      const prods = await ctx.db
        .query("products")
        .withIndex("byProductType", (q) => q.eq("productTypeId", t._id))
        .collect();
      for (const p of prods) await ctx.db.delete(p._id);
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(id);
  },
});

// ── Product Types ─────────────────────────────────────────────────────────────

export const createType = mutation({
  args: {
    productLineId: v.id("productLines"),
    projectId: v.id("projects"),
    name: v.string(),
    usageType: v.optional(v.string()),
    lookupKey: v.optional(v.string()),
  },
  handler: async (ctx, { productLineId, projectId, name, usageType, lookupKey }) => {
    const existing = await ctx.db
      .query("productTypes")
      .withIndex("byProductLine", (q) => q.eq("productLineId", productLineId))
      .collect();
    return await ctx.db.insert("productTypes", {
      productLineId,
      projectId,
      name,
      usageType,
      lookupKey,
      order: existing.length,
      createdAt: Date.now(),
    });
  },
});

export const updateType = mutation({
  args: {
    id: v.id("productTypes"),
    name: v.optional(v.string()),
    usageType: v.optional(v.string()),
    lookupKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteType = mutation({
  args: { id: v.id("productTypes") },
  handler: async (ctx, { id }) => {
    const prods = await ctx.db
      .query("products")
      .withIndex("byProductType", (q) => q.eq("productTypeId", id))
      .collect();
    for (const p of prods) await ctx.db.delete(p._id);
    await ctx.db.delete(id);
  },
});

// ── Products ──────────────────────────────────────────────────────────────────

export const createProduct = mutation({
  args: {
    productTypeId: v.id("productTypes"),
    productLineId: v.id("productLines"),
    projectId: v.id("projects"),
    name: v.string(),
    productCode: v.optional(v.string()),
    isLineOfCredit: v.optional(v.boolean()),
    excludeFromLoanProducts: v.optional(v.boolean()),
  },
  handler: async (ctx, { productTypeId, productLineId, projectId, name, productCode, isLineOfCredit, excludeFromLoanProducts }) => {
    const existing = await ctx.db
      .query("products")
      .withIndex("byProductType", (q) => q.eq("productTypeId", productTypeId))
      .collect();
    return await ctx.db.insert("products", {
      productTypeId,
      productLineId,
      projectId,
      name,
      productCode,
      isLineOfCredit,
      excludeFromLoanProducts,
      order: existing.length,
      createdAt: Date.now(),
    });
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    productCode: v.optional(v.string()),
    isLineOfCredit: v.optional(v.boolean()),
    excludeFromLoanProducts: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteProduct = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
