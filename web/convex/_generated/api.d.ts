/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checklist from "../checklist.js";
import type * as collateral from "../collateral.js";
import type * as conditions from "../conditions.js";
import type * as covenants from "../covenants.js";
import type * as docman from "../docman.js";
import type * as fees from "../fees.js";
import type * as heatmap from "../heatmap.js";
import type * as picklists from "../picklists.js";
import type * as policyExceptions from "../policyExceptions.js";
import type * as productHierarchy from "../productHierarchy.js";
import type * as projects from "../projects.js";
import type * as seedData from "../seedData.js";
import type * as stages from "../stages.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checklist: typeof checklist;
  collateral: typeof collateral;
  conditions: typeof conditions;
  covenants: typeof covenants;
  docman: typeof docman;
  fees: typeof fees;
  heatmap: typeof heatmap;
  picklists: typeof picklists;
  policyExceptions: typeof policyExceptions;
  productHierarchy: typeof productHierarchy;
  projects: typeof projects;
  seedData: typeof seedData;
  stages: typeof stages;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
