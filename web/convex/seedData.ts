// Canonical PHASES template — ported from commercial_lending_heatmap (2).html DATA array.
// New projects are seeded from this. Each project's heatmap is independently
// editable after seeding.

export type SeedCardType = "low" | "high" | "manual" | "custom" | "linked";

export interface SeedCard {
  name: string;
  sub: string;
  type: SeedCardType;
  featureId?: number;
  configuratorKind?: "covenants" | "checklist" | "product-hierarchy" | "docman" | "collateral" | "conditions" | "policy-exceptions" | "fees";
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
    name: "Prospecting",
    subphases: [
      {
        name: "Prospecting",
        cards: [
          { featureId: 101, name: "Create or Update Relationship", sub: "Relationship", type: "low" },
          { featureId: 102, name: "Business Lookup", sub: "Retrieve Company Info (e.g. Companies House)", type: "low" },
          { featureId: 103, name: "Hierarchy Visualization", sub: "Connections, Credit Groups, 360 Exposure, Households", type: "low" },
          { featureId: 104, name: "Capture Preliminary Info", sub: "Deal Proposal", type: "low" },
          { featureId: 105, name: "Select Product(s)", sub: "Product Catalogue & Hierarchy", type: "linked", configuratorKind: "product-hierarchy" },
          { featureId: 106, name: "Advance Deal", sub: "Product Package (Deal)", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Qualification",
    subphases: [
      {
        name: "Qualification",
        cards: [
          { featureId: 201, name: "Onboarding new customer", sub: "Onboarding", type: "low" },
          { featureId: 202, name: "Run Credit Check", sub: "", type: "low" },
          { featureId: 203, name: "Build Loan Information", sub: "", type: "low" },
          { featureId: 204, name: "Loan Team", sub: "", type: "low" },
          { featureId: 205, name: "Borrowing Structure", sub: "", type: "low" },
          { featureId: 206, name: "Loan Structuring", sub: "Rates & Payments", type: "low" },
          { featureId: 207, name: "Amortisation Schedule", sub: "Sherman", type: "high" },
          { featureId: 208, name: "Fee Management", sub: "Fees", type: "linked", configuratorKind: "fees" },
          { featureId: 209, name: "Add collateral & collateral groups", sub: "Collateral Mgmt", type: "linked", configuratorKind: "collateral" },
          { featureId: 210, name: "Bulk update and manage loans", sub: "Deal management", type: "low" },
          { featureId: 211, name: "Add covenants to deal or loans", sub: "Covenants", type: "linked", configuratorKind: "covenants" },
          { featureId: 212, name: "Collect & Store Documents", sub: "Document Manager", type: "linked", configuratorKind: "docman" },
          { featureId: 213, name: "Generate Documents", sub: "DocGen / FormsGen", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Underwriting",
    subphases: [
      {
        name: "Underwriting",
        cards: [
          { featureId: 301, name: "Gather & Analyse Financials", sub: "Spreading", type: "low" },
          { featureId: 302, name: "Analyse Collateral", sub: "Rent Roll and Tenancy Management", type: "high" },
          { featureId: 303, name: "Review Exposure", sub: "Exposure", type: "low" },
          { featureId: 304, name: "Run Risk Rating", sub: "Risk Rating engine", type: "low" },
          { featureId: 305, name: "Mitigate Policy Exceptions", sub: "Policy Exceptions", type: "linked", configuratorKind: "policy-exceptions" },
          { featureId: 306, name: "Review Covenants", sub: "Covenant Servicing", type: "linked", configuratorKind: "covenants" },
          { featureId: 307, name: "Populate Credit Memo", sub: "Credit Memo", type: "high" },
          { featureId: 308, name: "Submit for Approval", sub: "Approval Process", type: "low" },
          { featureId: 309, name: "Add Conditions", sub: "Conditions", type: "linked", configuratorKind: "conditions" },
        ],
      },
    ],
  },
  {
    name: "Approval",
    subphases: [
      {
        name: "Approval",
        cards: [
          { featureId: 401, name: "Review Credit Memo", sub: "Credit Memo", type: "low" },
          { featureId: 402, name: "Refer to Credit Committee", sub: "Credit Committee", type: "high" },
          { featureId: 403, name: "Approve Deal", sub: "Approval Process", type: "low" },
          { featureId: 404, name: "Decline/Withdraw Deal", sub: "Adverse Actions", type: "low" },
          { featureId: 405, name: "Generate Declination Letter & Other Docs", sub: "DocGen / FormsGen", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Processing",
    subphases: [
      {
        name: "Processing",
        cards: [
          { featureId: 501, name: "Order 3rd Party Reports", sub: "Third Party Reports", type: "high" },
          { featureId: 502, name: "Add Fees to Loan", sub: "Fee Management", type: "linked", configuratorKind: "fees" },
          { featureId: 503, name: "Review/Approve Reports", sub: "Approval Process", type: "low" },
          { featureId: 504, name: "Post Approval Change", sub: "Memo", type: "low" },
          { featureId: 505, name: "Collect & Store Documents", sub: "Document Manager", type: "linked", configuratorKind: "docman" },
        ],
      },
    ],
  },
  {
    name: "Doc Preparation",
    subphases: [
      {
        name: "Doc Preparation",
        cards: [
          { featureId: 601, name: "Generate Offer Letter & Other Docs", sub: "DocGen / FormsGen", type: "low" },
          { featureId: 602, name: "Sign Documents", sub: "Signicat", type: "high" },
          { featureId: 603, name: "Collect & Store Documents", sub: "Document Manager", type: "linked", configuratorKind: "docman" },
        ],
      },
    ],
  },
  {
    name: "Final Review",
    subphases: [
      {
        name: "Final Review",
        cards: [
          { featureId: 701, name: "Collect Fees", sub: "Fee Management", type: "linked", configuratorKind: "fees" },
          { featureId: 702, name: "Collateral Management", sub: "Collateral", type: "linked", configuratorKind: "collateral" },
          { featureId: 703, name: "Loan Closing Checks (Document Manager)", sub: "Document Manager", type: "linked", configuratorKind: "docman" },
          { featureId: 704, name: "Loan Closing Checks (Conditions)", sub: "Conditions", type: "linked", configuratorKind: "conditions" },
          { featureId: 705, name: "Loan Closing Checks (Covenant Servicing)", sub: "Covenant Servicing / Management", type: "linked", configuratorKind: "covenants" },
          { featureId: 706, name: "Construction Loan Administration", sub: "", type: "high" },
          { featureId: 707, name: "Budget", sub: "(Construction Loan Admin)", type: "high" },
          { featureId: 708, name: "Draws and Disbursements", sub: "(Construction Loan Admin)", type: "high" },
        ],
      },
    ],
  },
  {
    name: "Booking & Monitoring",
    subphases: [
      {
        name: "Booking & Monitoring",
        cards: [
          { featureId: 801, name: "Transfer of data from origination to core", sub: "Finacle", type: "high" },
          { featureId: 802, name: "Covenants Monitoring", sub: "Covenant Mgmt", type: "linked", configuratorKind: "covenants" },
          { featureId: 803, name: "Automated Covenant testing", sub: "", type: "high" },
          { featureId: 804, name: "MI Mgmt & Exposure Levels", sub: "Spreads & Exposure", type: "low" },
          { featureId: 805, name: "Re-evaluate Collateral", sub: "Collateral", type: "linked", configuratorKind: "collateral" },
          { featureId: 806, name: "Carry out Reviews", sub: "Reviews (manual or automated)", type: "low" },
          { featureId: 807, name: "Agentic Reviews", sub: "", type: "high" },
          { featureId: 808, name: "Portfolio Monitoring", sub: "Continuous Credit Monitoring", type: "high" },
          { featureId: 809, name: "Renew/Modify/Extend Loan(s)", sub: "Credit Actions", type: "low" },
          { featureId: 810, name: "Handover Loans to BSU", sub: "Handover Loans", type: "low" },
          { featureId: 811, name: "Breach Document Generation", sub: "DocGen / FormsGen", type: "low" },
        ],
      },
    ],
  },
  {
    name: "Complete",
    subphases: [
      {
        name: "Complete",
        cards: [
          { featureId: 901, name: "Collections", sub: "", type: "low" },
          { featureId: 902, name: "Recoveries", sub: "", type: "low" },
          { featureId: 903, name: "Collateral release", sub: "Collateral Management", type: "linked", configuratorKind: "collateral" },
        ],
      },
    ],
  },
];
