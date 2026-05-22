// Default picklist values for each configurator scope.
// Ported from the legacy Covenants/index.html and smart-checklist-builder/index.html.

export const COVENANT_PICKLISTS: Record<string, string[]> = {
  category: ["Financial", "Reporting", "Operational", "Insurance", "Legal", "Other"],
  frequency: ["Annually", "Semi-Annually", "Quarterly", "Monthly", "Ad Hoc", "One-Time"],
  financialIndicator: [
    "DSCR",
    "Fixed Charge Coverage Ratio",
    "Leverage Ratio",
    "Current Ratio",
    "Debt to Equity",
    "Net Worth",
    "Other",
  ],
};

export const COVENANT_PICKLIST_LABELS: Record<string, string> = {
  category: "Category",
  frequency: "Frequency Template",
  financialIndicator: "Financial Indicator",
};

// Covenant type lists are stored per-category in the picklists table under
// keys like "covType:Financial". This prefix identifies those rows.
export const COV_TYPE_KEY_PREFIX = "covType:";

export const COVENANT_CATEGORY_TYPE_MAP: Record<string, string[]> = {
  Financial: [
    "Cash Flow Forecast",
    "Financial Indicator",
    "Leverage Ratio",
    "Debt Service Coverage",
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

export const CHECKLIST_PICKLISTS: Record<string, string[]> = {
  taskType: ["Pre-Offer", "Post-Offer", "Solicitor", "Internal", "N/A"],
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
  approvalProcess: ["Self-Approval", "Submit for Approval"],
  requirementType: ["Condition Precedent", "Condition Subsequent"],
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
};

export const CHECKLIST_PICKLIST_LABELS: Record<string, string> = {
  taskType: "Task Type",
  category: "Category",
  assignedParty: "Assignee",
  neededBy: "Needed By",
  approvalProcess: "Approval Process",
  requirementType: "Requirement Type",
};
