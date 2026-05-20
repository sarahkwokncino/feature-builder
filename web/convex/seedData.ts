// Canonical PHASES template — ported verbatim from legacy Heatmap/index.html.
// New projects are seeded from this. Each project's heatmap is independently
// editable after seeding.

export type SeedCardType = "low" | "high" | "manual" | "custom" | "linked";

export interface SeedCard {
  name: string;
  sub: string;
  type: SeedCardType;
  configuratorKind?: "covenants" | "checklist";
}

export interface SeedSubphase {
  name: string;
  cards: SeedCard[];
}

export interface SeedPhase {
  name: string;
  subphases: SeedSubphase[];
}

export const SEED_PHASES: SeedPhase[] = [
  {
    name: "Qualification",
    subphases: [
      {
        name: "Referral",
        cards: [
          { name: "Opportunity Intake", sub: "Customer Portal", type: "low" },
          { name: "Create & Amend Relationships", sub: "Relationship", type: "low" },
          { name: "Create Prospects", sub: "Relationship", type: "low" },
          { name: "Create Hierarchies", sub: "Connections", type: "low" },
          { name: "Connect Related Entities & IDs", sub: "Connections", type: "low" },
          { name: "Upload Documents", sub: "Document Manager", type: "low" },
          { name: "Create Countries", sub: "Custom", type: "custom" },
        ],
      },
      {
        name: "Qualify",
        cards: [
          { name: "Spread Financials", sub: "Spreads", type: "low" },
          { name: "Risk Rating", sub: "Risk Rating", type: "low" },
          { name: "Compliance Checks", sub: "Multiple Systems", type: "high" },
          { name: "Compliance Checks", sub: "AECB, CBRB", type: "high" },
          { name: "Compliance Deviations", sub: "Smart checklist", type: "high" },
          { name: "Account Behaviour", sub: "Rel. & Doc Man", type: "low" },
          { name: "Capture Deal Info", sub: "Deal Proposal", type: "low" },
          { name: "Select Products", sub: "Product Catalogue & Hierarchy", type: "low" },
          { name: "Advance Deal", sub: "Product Package", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Underwriting",
    subphases: [
      {
        name: "Structure",
        cards: [
          { name: "Application Details", sub: "Product Package", type: "low" },
          { name: "Capture Economic Dependent Details", sub: "Relationship", type: "low" },
          { name: "Select Products", sub: "Product Catalogue & Hierarchy", type: "low" },
          { name: "Add Loan Limits", sub: "Facility Hierarchy", type: "low" },
          { name: "Build Loan Info", sub: "Loan team, Borrowing Structure", type: "high" },
          { name: "Add Fees", sub: "Fees", type: "low" },
          { name: "Add Pricing & Profitability", sub: "Facility", type: "low" },
          { name: "Amortisation Schedule", sub: "Loan Structuring", type: "high" },
          {
            name: "Add Covenants",
            sub: "Covenants",
            type: "linked",
            configuratorKind: "covenants",
          },
          { name: "Add Collateral", sub: "Collateral", type: "low" },
          { name: "Add Conditions", sub: "Conditions", type: "low" },
          { name: "Collect & Store Documents", sub: "Document Manager", type: "low" },
        ],
      },
      {
        name: "Analyse",
        cards: [
          { name: "Analyse Financials", sub: "Spreads", type: "low" },
          { name: "External Risk Ratings", sub: "Bankers Almanac", type: "high" },
          { name: "Analyse Collateral", sub: "Rent Roll & Tenancy Management", type: "high" },
          { name: "External Data (Countries & FI)", sub: "Bankers Almanac", type: "high" },
          { name: "Review Exposure", sub: "Finacle", type: "high" },
          { name: "Review Policy Exceptions", sub: "Policy Exceptions", type: "low" },
          { name: "Populate Credit Memo & CAS", sub: "Credit Memo", type: "high" },
          { name: "Risk Compliance Checklist", sub: "Smart Checklist", type: "low" },
          { name: "Run Entity Search Report", sub: "AECB, CBRB", type: "high" },
          { name: "Generate Term Sheet", sub: "Doc Gen", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Decisioning",
    subphases: [
      {
        name: "Approve",
        cards: [
          { name: "Review Credit Memo", sub: "Credit Memo", type: "low" },
          { name: "Refer to Credit Committee", sub: "Convene", type: "high" },
          { name: "Review Approval Tasks & Notifications", sub: "", type: "low" },
          { name: "Approve Deal", sub: "Approval Process", type: "low" },
          { name: "Decline Deal", sub: "Adverse Actions", type: "low" },
          { name: "Auto Decision", sub: "Auto Decision", type: "high" },
          { name: "Approve Rating", sub: "Moodys CreditLens", type: "high" },
          { name: "Submit for Review", sub: "Approval Process", type: "low" },
          { name: "Submit for Approval", sub: "Approval Process", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Fulfilment",
    subphases: [
      {
        name: "Review",
        cards: [
          { name: "Post Approval Change", sub: "Change Memo", type: "low" },
          {
            name: "Review Checklist",
            sub: "Smart Checklist",
            type: "linked",
            configuratorKind: "checklist",
          },
          { name: "Review by Checker", sub: "Approval Process", type: "low" },
          { name: "Digital Signature", sub: "TBC", type: "manual" },
        ],
      },
      {
        name: "Contract",
        cards: [
          { name: "Generate Facility Agreement", sub: "Doc Gen", type: "low" },
          { name: "Generate Security Agreement", sub: "Doc Gen", type: "low" },
          { name: "Covenant Booking", sub: "Finacle", type: "high" },
          { name: "Collect & Store Docs", sub: "Document Manager", type: "low" },
          { name: "Booking Form", sub: "Doc Gen", type: "low" },
        ],
      },
      {
        name: "Book",
        cards: [
          { name: "Limit Booking", sub: "Finacle", type: "high" },
          { name: "Security Booking", sub: "Finacle", type: "high" },
        ],
      },
    ],
  },
  {
    name: "Post-Fulfilment",
    subphases: [
      {
        name: "Service",
        cards: [
          { name: "Draws & Disbursements", sub: "Finacle", type: "high" },
          { name: "Condition Monitoring", sub: "Conditions", type: "low" },
          { name: "Reviews & Modifications", sub: "Credit Actions", type: "low" },
          { name: "Continuous Credit Monitoring", sub: "CCM", type: "high" },
        ],
      },
      {
        name: "Monitor",
        cards: [
          { name: "Covenant Monitoring", sub: "Covenant Mgmt", type: "low" },
          { name: "Condition Monitoring", sub: "Conditions", type: "low" },
          { name: "Bulk Annual Review (Country & FI)", sub: "Custom", type: "custom" },
        ],
      },
    ],
  },
];
