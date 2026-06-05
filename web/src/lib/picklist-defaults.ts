// Default picklist values for each configurator scope.
// Ported from the legacy Covenants/index.html and smart-checklist-builder/index.html.

export const COVENANT_PICKLISTS: Record<string, string[]> = {
  category: ["Financial", "Financial Indicator", "Reporting", "Operational", "Insurance", "Legal", "Other"],
  frequency: ["Annually", "Semi-Annually", "Quarterly", "Monthly", "Ad Hoc", "One-Time"],
};

export const COVENANT_PICKLIST_LABELS: Record<string, string> = {
  category: "Category",
  frequency: "Frequency Template",
};

// Covenant type lists are stored per-category in the picklists table under
// keys like "covType:Financial". This prefix identifies those rows.
export const COV_TYPE_KEY_PREFIX = "covType:";

export const COVENANT_CATEGORY_TYPE_MAP: Record<string, string[]> = {
  Financial: [
    "Cash Flow Forecast",
    "Leverage Ratio",
    "Debt Service Coverage",
  ],
  "Financial Indicator": [
    "DSCR",
    "Fixed Charge Coverage Ratio",
    "Leverage Ratio",
    "Current Ratio",
    "Debt to Equity",
    "Net Worth",
    "Other",
  ],
  Reporting: [
    "Annual Accounts",
    "Management Accounts",
    "Audit Report",
    "Compliance Certificate",
  ],
  Operational: ["Business Plan", "Insurance Certificate", "Board Resolution"],
  Insurance: ["Buildings Insurance", "Life Insurance", "Public Liability"],
  Legal: ["Legal Opinion", "Charge Registration", "Debenture"],
  Other: ["Ad Hoc", "Custom"],
};

// Collateral — types and subtypes per type
export const COLLATERAL_TYPE_SUBTYPE_MAP: Record<string, string[]> = {
  "Property Non Development": ["Residential", "Commercial", "Industrial", "Agricultural", "Mixed Use"],
  "Property Development": ["Residential Development", "Commercial Development"],
  "Financial Assets": ["Cash Deposit", "Shares", "Bonds", "Life Policy"],
  "Guarantees": ["Personal Guarantee", "Corporate Guarantee", "Government Guarantee"],
  "Other": ["Plant & Equipment", "Debenture", "Other"],
};

export const COLLATERAL_SUBTYPE_KEY_PREFIX = "collateralSubtype:";

export const CHECKLIST_PICKLISTS: Record<string, string[]> = {
  category: ["General", "Residential", "Commercial", "Development"],
  assignedParty: [
    "Credit Analyst / Underwriter",
    "Credit Manager",
    "Relationship Manager",
    "Packaging Analyst",
    "Compliance Officer",
    "Legal",
    "Solicitor",
    "Surveyor",
    "Other",
  ],
  neededBy: [
    "Full Application",
    "Loan Packaging",
    "Credit Underwriting",
    "Approval / Loan Committee",
    "Doc Prep",
    "Conveyancing",
    "Facility Issuance",
    "Final Review",
    "Booked",
    "Complete",
  ],
  placeholderName: [],
};

export const CHECKLIST_PICKLIST_LABELS: Record<string, string> = {
  category: "Category",
  assignedParty: "Assignee",
  neededBy: "Needed By",
  placeholderName: "Document Manager Placeholder",
};
