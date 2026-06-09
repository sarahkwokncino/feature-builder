import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    customer: v.optional(v.string()),
    region: v.optional(v.string()),
    createdAt: v.number(),
  }),

  heatmaps: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    version: v.number(),
    createdAt: v.number(),
  }).index("byProject", ["projectId"]),

  phases: defineTable({
    heatmapId: v.id("heatmaps"),
    name: v.string(),
    order: v.number(),
  }).index("byHeatmap", ["heatmapId"]),

  subphases: defineTable({
    phaseId: v.id("phases"),
    name: v.string(),
    order: v.number(),
  }).index("byPhase", ["phaseId"]),

  cards: defineTable({
    subphaseId: v.id("subphases"),
    name: v.string(),
    sub: v.optional(v.string()),
    type: v.union(
      v.literal("low"),
      v.literal("high"),
      v.literal("manual"),
      v.literal("custom"),
      v.literal("linked"),
    ),
    status: v.union(
      v.literal("not-configured"),
      v.literal("configured"),
      v.literal("linked"),
    ),
    order: v.number(),
    // configRef points at a row in a per-type configurator table
    // (e.g. covenants, checklistReqs). Optional — many cards have no configurator.
    configuratorKind: v.optional(
      v.union(
        v.literal("covenants"),
        v.literal("checklist"),
        v.literal("product-hierarchy"),
        v.literal("docman"),
        v.literal("collateral"),
        v.literal("conditions"),
        v.literal("policy-exceptions"),
        v.literal("fees"),
      ),
    ),
  }).index("bySubphase", ["subphaseId"]),

  // ── Configurator tables ────────────────────────────────────────────────────
  // Covenants — ports localStorage keys covenant-type-builder-v1,
  // covenant-type-builder-picklists-v1, covenant-type-builder-cat-map-v1
  covenants: defineTable({
    cardId: v.id("cards"),
    autoNum: v.string(), // e.g. "COV-000001"
    name: v.string(),
    category: v.optional(v.string()),
    type: v.optional(v.string()),
    frequency: v.optional(v.string()),
    financialIndicator: v.optional(v.string()),
    description: v.optional(v.string()),
    effectiveDate: v.optional(v.string()), // ISO date string YYYY-MM-DD
    graceDays: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byCard", ["cardId"]),

  // Smart Checklist requirements — ports smart-checklist-builder-v1
  checklistReqs: defineTable({
    cardId: v.id("cards"),
    checklistLevel: v.optional(v.union(v.literal("Loan"), v.literal("Relationship"))),
    name: v.string(),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byCard", ["cardId"]),

  // ── Product Hierarchy ─────────────────────────────────────────────────────
  // Mirrors nCino's LLC_BI__Product_Line__c → LLC_BI__Product_Type__c → LLC_BI__Product__c
  productLines: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    productObject: v.optional(v.string()), // LLC_BI__Product_Object__c
    order: v.number(),
    createdAt: v.number(),
  }).index("byProject", ["projectId"]),

  productTypes: defineTable({
    productLineId: v.id("productLines"),
    projectId: v.id("projects"),
    name: v.string(),
    usageType: v.optional(v.string()),   // LLC_BI__Usage_Type__c
    lookupKey: v.optional(v.string()),   // LLC_BI__lookupKey__c
    order: v.number(),
    createdAt: v.number(),
  }).index("byProductLine", ["productLineId"])
    .index("byProject", ["projectId"]),

  products: defineTable({
    productTypeId: v.id("productTypes"),
    productLineId: v.id("productLines"),
    projectId: v.id("projects"),
    name: v.string(),
    productCode: v.optional(v.string()),    // LLC_BI__lookupKey__c — core integration code
    isLineOfCredit: v.optional(v.boolean()),
    excludeFromLoanProducts: v.optional(v.boolean()),
    order: v.number(),
    createdAt: v.number(),
  }).index("byProductType", ["productTypeId"])
    .index("byProject", ["projectId"]),

  // ── Document Manager ──────────────────────────────────────────────────────
  // A "configuration group" is a named set of conditions (e.g. "Real Estate Loans").
  // Each group contains one or more placeholders to generate when those conditions are met.
  // A conditional group: criteria + which placeholders fire when those criteria are met.
  // Scoped to one level so the placeholder selector only shows relevant options.
  docmanGroups: defineTable({
    cardId: v.id("cards"),
    level: v.union(
      v.literal("Relationships"),
      v.literal("Loans"),
      v.literal("Collateral"),
      v.literal("Product Package"),
    ),
    name: v.string(),
    criteriaUserWritten: v.optional(v.string()),
    criteriaFormgen: v.optional(v.string()),
    placeholderIds: v.array(v.string()),        // ids of selected docmanPlaceholders
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byCard", ["cardId"]),

  docmanPlaceholders: defineTable({
    cardId: v.id("cards"),
    name: v.string(),
    // level maps to LLC_BI__DocManager__c.LLC_BI__Type__c:
    //   Relationships   → Account
    //   Loans           → llc_bi__loan__c
    //   Collateral      → LLC_BI__Collateral__c
    //   Product Package → LLC_BI__Product_Package__c
    level: v.union(
      v.literal("Relationships"),
      v.literal("Loans"),
      v.literal("Collateral"),
      v.literal("Product Package"),
    ),
    // category → exported as LLC_BI__DocType__c.Name; required on ClosingChecklist but optional here
    category: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),         // always generated for this level
    order: v.number(),
    createdAt: v.number(),
  }).index("byCard", ["cardId"]),

  // Collateral field config — one row per projectId + type + subtype
  collateralFieldConfigs: defineTable({
    projectId: v.id("projects"),
    collateralType: v.string(),
    collateralSubtype: v.string(),
    sections: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        fields: v.array(v.object({
          name: v.string(),
          fieldType: v.string(),
          picklistValues: v.optional(v.array(v.string())),
        })),
      }),
    ),
    linkedTo: v.optional(v.object({
      collateralType: v.string(),
      collateralSubtype: v.string(),
    })),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"])
    .index("byProjectTypeSubtype", ["projectId", "collateralType", "collateralSubtype"]),

  // Loan Conditions — LLC_BI__Requirement__c with conditionType "Condition Precedent" / "Condition Subsequent"
  conditionReqs: defineTable({
    projectId: v.id("projects"),
    conditionType: v.union(v.literal("Condition Precedent"), v.literal("Condition Subsequent")),
    name: v.string(),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"]),

  // Policy Exceptions — LLC_BI__PolicyException__c + mitigation reasons
  policyExceptions: defineTable({
    projectId: v.id("projects"),
    type: v.string(),           // group/type (e.g. "Collateral")
    name: v.string(),           // exception name
    severities: v.array(v.string()),  // subset of ["Minor", "Major", "Critical"]
    mitigationReasons: v.array(
      v.object({
        reason: v.string(),
        commentRequired: v.boolean(),
      }),
    ),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"]),

  // Fees — LLC_BI__Fee__c preconfigured fee templates
  fees: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    feePaidBy: v.optional(v.string()),
    calculationType: v.optional(v.union(v.literal("Flat Amount"), v.literal("Percentage"))),
    basisSource: v.optional(v.string()),
    percentage: v.optional(v.number()),
    amount: v.optional(v.number()),
    collectionMethod: v.optional(v.string()),
    autoApply: v.optional(v.boolean()),
    appliedToProducts: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"]),

  // Builder lock state — one row per projectId + kind when locked
  builderLocks: defineTable({
    projectId: v.id("projects"),
    kind: v.string(),
    lockedAt: v.number(),
  }).index("byProject", ["projectId"])
    .index("byProjectKind", ["projectId", "kind"]),

  // Entity Involvement Types — how a relationship is involved with a loan
  involvementTypes: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"]),

  // Connection roles — connecting role names between relationship types
  connectionRoles: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    fromType: v.optional(v.string()),
    toType: v.optional(v.string()),
    description: v.optional(v.string()),
    selfReciprocating: v.optional(v.boolean()),
    reciprocalRole: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"]),

  // Relationship field config — one row per projectId + relationshipType
  relationshipFieldConfigs: defineTable({
    projectId: v.id("projects"),
    relationshipType: v.string(),
    sections: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        fields: v.array(v.object({
          name: v.string(),
          fieldType: v.string(),
          picklistValues: v.optional(v.array(v.string())),
        })),
      }),
    ),
    linkedTo: v.optional(v.object({
      relationshipType: v.string(),
    })),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"])
    .index("byProjectType", ["projectId", "relationshipType"]),

  // Picklist values, scoped per configurator
  picklists: defineTable({
    scope: v.union(v.literal("covenants"), v.literal("checklist"), v.literal("collateral"), v.literal("conditions"), v.literal("policy-exceptions"), v.literal("fees"), v.literal("relationships")),
    key: v.string(),
    values: v.array(v.string()),
  }).index("byScopeKey", ["scope", "key"]),

  // Stages — nCino loan lifecycle stages
  stages: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    isFixed: v.optional(v.boolean()),   // true for Booked and Complete — cannot rename/delete
    keyFields: v.optional(v.array(v.string())), // up to 5 key field labels
    enabledTabs: v.optional(v.array(v.string())), // tabs enabled for this stage; undefined = all on
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byProject", ["projectId"]),

  // Sections on the Details tab for a given stage
  stageSections: defineTable({
    stageId: v.id("stages"),
    projectId: v.id("projects"),
    name: v.string(),
    isDefault: v.optional(v.boolean()),
    isHidden: v.optional(v.boolean()),
    description: v.optional(v.string()),
    subsections: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      fields: v.array(v.object({
        id: v.string(),
        name: v.string(),
        fieldType: v.string(),
      })),
      sections: v.optional(v.array(v.object({
        id: v.string(),
        name: v.string(),
        fields: v.array(v.object({
          id: v.string(),
          name: v.string(),
          fieldType: v.string(),
        })),
      }))),
    }))),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byStage", ["stageId"])
    .index("byProject", ["projectId"]),
});
