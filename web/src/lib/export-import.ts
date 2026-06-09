import { CHECKLIST_PICKLISTS } from "./picklist-defaults";

// ── shared helpers ────────────────────────────────────────────────────────────

function yamlStr(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

const today = () => new Date().toISOString().slice(0, 10);

// ── Covenant types ─────────────────────────────────────────────────────────────

export type CovenantRecord = {
  name: string;
  category?: string;
  type?: string;
  frequency?: string;
  description?: string;
};

export type CovenantPicklists = {
  categories: string[];
  covenantTypesByCategory: Record<string, string[]>;
  frequencies: string[];
};

export function buildCovenantsYaml(
  picklists: CovenantPicklists,
  meta: { storyId: string; title: string; featureArea: string },
): string {
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: covenant-type-builder\n  ref: "covenant-type-builder@${today()}"\n\nrecords:\n\n`;

  // One LLC_BI__Covenant_Type__c entry per category × covenant type
  for (const cat of picklists.categories) {
    const types = picklists.covenantTypesByCategory[cat] ?? [];
    if (!types.length) continue;
    y += `  # ${cat}\n`;
    for (const t of types) {
      y += `  - object: LLC_BI__Covenant_Type__c\n`;
      y += `    fields:\n`;
      y += `      Name: "${yamlStr(t)}"\n`;
      y += `      LLC_BI__Category__c: "${yamlStr(cat)}"\n`;
      y += `      LLC_BI__Active__c: true\n\n`;
    }
  }

  // Frequency / Date Templates
  if (picklists.frequencies.length) {
    y += `  # Frequency Templates (LLC_BI__Date_Template__c — referenced via LLC_BI__Date_Template__r.Name)\n`;
    for (const freq of picklists.frequencies) {
      y += `  - object: LLC_BI__Date_Template__c\n`;
      y += `    fields:\n`;
      y += `      Name: "${yamlStr(freq)}"\n\n`;
    }
  }

  return y;
}

export function downloadCovenantsYaml(
  picklists: CovenantPicklists,
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildCovenantsYaml(picklists, meta);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "covenants")}.yaml`,
  );
}

export function downloadCovenantsExcel(picklists: CovenantPicklists) {
  // Sheet 1: one row per category × covenant type → LLC_BI__Covenant_Type__c
  const typeRows: unknown[][] = [
    ["LLC_BI__Category__c", "Name", "LLC_BI__Active__c"],
  ];
  for (const cat of picklists.categories) {
    for (const t of picklists.covenantTypesByCategory[cat] ?? []) {
      typeRows.push([cat, t, "true"]);
    }
  }

  // Sheet 2: Frequency Templates → LLC_BI__Date_Template__c
  const freqRows: unknown[][] = [
    ["Name"],
    ...picklists.frequencies.map((f) => [f]),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(typeRows, "Covenant Types") +
    buildXlsxSheet(freqRows, "Frequency Templates") +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "covenant-picklists.xls",
  );
}

export function parseCovenantsYaml(text: string): CovenantRecord[] | string {
  const blocks = text.split(/\n  - object: LLC_BI__Covenant_Type__c/);
  blocks.shift();
  const parsed: CovenantRecord[] = [];
  for (const block of blocks) {
    const gF = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*"([^"]*)"`, "i"));
      return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "";
    };
    const name = gF("Name");
    if (!name) continue;
    parsed.push({
      name,
      category: gF("LLC_BI__Category__c") || undefined,
      description: gF("LLC_BI__Description__c") || undefined,
      frequency: gF("LLC_BI__Frequency__c") || undefined,
    });
  }
  if (!parsed.length) return "No LLC_BI__Covenant_Type__c records found.";
  return parsed;
}

export function parseCovenantsCSv(text: string): CovenantRecord[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty.";
  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const colIdx: Partial<Record<keyof CovenantRecord, number>> = {};
  for (const col of COVENANT_CSV_COLS) {
    const i = headers.indexOf(col.label);
    if (i !== -1) colIdx[col.key] = i;
  }
  if (colIdx["name"] === undefined) return 'Could not find a "Name" column.';
  const parsed: CovenantRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const get = (key: keyof CovenantRecord) =>
      colIdx[key] !== undefined ? (cells[colIdx[key]!] || "").trim() : "";
    const name = get("name");
    if (!name) continue;
    parsed.push({
      name,
      category: get("category") || undefined,
      description: get("description") || undefined,
      frequency: get("frequency") || undefined,
    });
  }
  if (!parsed.length) return "No data rows found.";
  return parsed;
}

// ── Smart Checklist ────────────────────────────────────────────────────────────

export type ChecklistLevel = "Loan" | "Relationship";

export type ChecklistRecord = {
  name: string;
  checklistLevel?: ChecklistLevel;
  category?: string;
  assignedParty?: string;
  neededBy?: string;
  description?: string;
  legalDescription?: string;
  stageCheck?: boolean;
  doNotAutoGenerate?: boolean;
  criteriaUserWritten?: string;
  criteriaGenerated?: string;
  placeholderName?: string;
};

const CHECKLIST_PICKLIST_FIELD_MAP: Record<
  string,
  { object: string; field: string; label: string }
> = {
  category: {
    object: "LLC_BI__Requirement__c",
    field: "LLC_BI__Category__c",
    label: "Category",
  },
  assignedParty: {
    object: "LLC_BI__Requirement__c",
    field: "LLC_BI__Assigned_Party__c",
    label: "Assignee",
  },
  neededBy: {
    object: "LLC_BI__Requirement__c",
    field: "LLC_BI__Needed_By__c",
    label: "Needed By",
  },
};

function getCustomPicklistValues(
  records: ChecklistRecord[],
  userPicklists: Map<string, string[]>,
): Map<string, Set<string>> {
  const custom = new Map<string, Set<string>>();
  for (const req of records) {
    for (const key of ["category", "assignedParty", "neededBy"] as const) {
      const val = req[key];
      const defaults = userPicklists.get(key) ?? CHECKLIST_PICKLISTS[key] ?? [];
      if (val && !defaults.includes(val)) {
        if (!custom.has(key)) custom.set(key, new Set());
        custom.get(key)!.add(val);
      }
    }
  }
  return custom;
}

const CHECKLIST_LEVEL_CONFIG: Record<ChecklistLevel, { checklistName: string }> = {
  Loan: { checklistName: "LLC_BI__Loan__c" },
  Relationship: { checklistName: "Account" },
};

function buildChecklistYamlSection(reqs: ChecklistRecord[], level: ChecklistLevel): string {
  const { checklistName } = CHECKLIST_LEVEL_CONFIG[level];
  let y = `# ${"─".repeat(70)}\n`;
  y += `# ${level.toUpperCase()} LEVEL REQUIREMENTS\n`;
  y += `# Checklist lookup: SELECT Id FROM LLC_BI__Checklist__c\n`;
  y += `#                   WHERE LLC_BI__Checklist__r.Name = '${checklistName}'\n`;
  y += `# Set LLC_BI__Requirement__c.LLC_BI__Checklist__c to the Id found above.\n`;
  y += `# ${"─".repeat(70)}\n\n`;
  for (const req of reqs) {
    y += `  - object: LLC_BI__Requirement__c\n    fields:\n`;
    y += `      Name: "${yamlStr(req.name)}"\n`;
    y += `      LLC_BI__Is_Template__c: true\n`;
    y += `      # LLC_BI__Checklist__c: <Id of LLC_BI__Checklist__c where Name = '${checklistName}'>\n`;
    if (req.category) y += `      LLC_BI__Category__c: "${yamlStr(req.category)}"\n`;
    if (req.description) y += `      LLC_BI__Description__c: "${yamlStr(req.description)}"\n`;
    if (req.legalDescription) y += `      LLC_BI__Legal_Description__c: "${yamlStr(req.legalDescription)}"\n`;
    if (req.assignedParty) y += `      LLC_BI__Assigned_Party__c: "${yamlStr(req.assignedParty)}"\n`;
    if (req.neededBy) y += `      LLC_BI__Needed_By__c: "${yamlStr(req.neededBy)}"\n`;
    y += `      LLC_BI__Do_Not_Auto_Generate__c: ${req.doNotAutoGenerate ?? false}\n`;
    if (req.stageCheck) y += `      LLC_BI__Stage_Check__c: true\n`;
    if (req.placeholderName) {
      y += `      # Linked Document Manager Placeholder: "${yamlStr(req.placeholderName)}"\n`;
      y += `      LLC_BI__Document_Manager_Placeholder__c: "${yamlStr(req.placeholderName)}"\n`;
    }
    if (req.criteriaGenerated) {
      y += `      # Criteria (user written): ${yamlStr(req.criteriaUserWritten)}\n`;
      y += `      LLC_BI__Advanced_Criteria__c: "${yamlStr(req.criteriaGenerated)}"\n`;
    }
    y += `\n`;
  }
  return y;
}

export function buildChecklistYaml(
  records: ChecklistRecord[],
  meta: { storyId: string; title: string; featureArea: string },
  userPicklists: Map<string, string[]>,
): string {
  const named = records.filter((r) => r.name.trim());
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: smart-checklist-builder\n  ref: "smart-checklist-builder@${today()}"\n\nrecords:\n\n`;
  if (!named.length) {
    y += "  # No named requirements yet.\n";
    return y;
  }
  const loanReqs = named.filter((r) => (r.checklistLevel ?? "Loan") === "Loan");
  const relReqs = named.filter((r) => r.checklistLevel === "Relationship");
  if (loanReqs.length) y += buildChecklistYamlSection(loanReqs, "Loan");
  if (relReqs.length) y += buildChecklistYamlSection(relReqs, "Relationship");

  const customValues = getCustomPicklistValues(named, userPicklists);
  if (customValues.size) {
    y += `# ${"═".repeat(70)}\n`;
    y += `# ⚠️  CUSTOM PICKLIST VALUES — ACTION REQUIRED BEFORE DEPLOYING\n`;
    y += `# The following values are not in the default picklist and must be\n`;
    y += `# added to the Salesforce picklist field on the specified object\n`;
    y += `# before importing these records (Setup > Object Manager > Fields).\n`;
    y += `# ${"═".repeat(70)}\n`;
    for (const [key, vals] of customValues.entries()) {
      const info = CHECKLIST_PICKLIST_FIELD_MAP[key];
      if (!info) continue;
      y += `#\n#   Object: ${info.object}\n#   Field:  ${info.field}\n#   New values to add:\n`;
      for (const v of vals) y += `#     - "${v}"\n`;
    }
    y += `# ${"═".repeat(70)}\n`;
  }

  const placeholderList = [
    ...(CHECKLIST_PICKLISTS.placeholderName ?? []),
    ...(userPicklists.get("placeholderName") ?? []),
  ];
  const uniquePlaceholders = [...new Set(placeholderList)];
  if (uniquePlaceholders.length) {
    y += `\n# ${"═".repeat(70)}\n`;
    y += `# DOCUMENT MANAGER PLACEHOLDERS — VERIFY BEFORE DEPLOYING\n`;
    y += `# The following placeholders are referenced by requirements above.\n`;
    y += `# Ensure each exists in Document Manager before importing,\n`;
    y += `# or create it first.\n`;
    y += `# ${"═".repeat(70)}\n`;
    for (const p of uniquePlaceholders) y += `#   - "${p}"\n`;
    y += `# ${"═".repeat(70)}\n`;
  }
  return y;
}

export function downloadChecklistYaml(
  records: ChecklistRecord[],
  meta: { storyId: string; title: string; featureArea: string },
  userPicklists: Map<string, string[]>,
) {
  const yaml = buildChecklistYaml(records, meta, userPicklists);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "smart-checklist")}.yaml`,
  );
}

const EXCEL_COLS: { key: keyof ChecklistRecord; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "checklistLevel", label: "Checklist_Level__c" },
  { key: "category", label: "LLC_BI__Category__c" },
  { key: "description", label: "LLC_BI__Description__c" },
  { key: "legalDescription", label: "LLC_BI__Legal_Description__c" },
  { key: "assignedParty", label: "LLC_BI__Assigned_Party__c" },
  { key: "neededBy", label: "LLC_BI__Needed_By__c" },
  { key: "doNotAutoGenerate", label: "LLC_BI__Do_Not_Auto_Generate__c" },
  { key: "stageCheck", label: "LLC_BI__Stage_Check__c" },
  { key: "placeholderName", label: "LLC_BI__Document_Manager_Placeholder__c" },
  { key: "criteriaUserWritten", label: "Criteria_User_Written__c" },
  { key: "criteriaGenerated", label: "LLC_BI__Advanced_Criteria__c" },
];

const EXCEL_FIXED_COLS: { label: string; value: string }[] = [
  { label: "LLC_BI__Is_Template__c", value: "Y" },
];

function xlsxEsc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildXlsxSheet(rows: unknown[][], sheetName: string): string {
  let xml = `<Worksheet ss:Name="${xlsxEsc(sheetName)}"><Table>`;
  for (const row of rows) {
    xml += "<Row>";
    for (const cell of row) {
      const isNum =
        cell !== "" &&
        cell !== true &&
        cell !== false &&
        !isNaN(Number(cell));
      xml += isNum
        ? `<Cell><Data ss:Type="Number">${xlsxEsc(cell)}</Data></Cell>`
        : `<Cell><Data ss:Type="String">${xlsxEsc(cell)}</Data></Cell>`;
    }
    xml += "</Row>";
  }
  xml += "</Table></Worksheet>";
  return xml;
}

function buildRequirementSheet(reqs: ChecklistRecord[], level: ChecklistLevel): string {
  const { checklistName } = CHECKLIST_LEVEL_CONFIG[level];
  const sheetName = level === "Loan" ? "Loan Requirements" : "Relationship Requirements";
  const rows: unknown[][] = [
    [`Checklist lookup: SELECT Id FROM LLC_BI__Checklist__c WHERE LLC_BI__Checklist__r.Name = '${checklistName}' — set LLC_BI__Requirement__c.LLC_BI__Checklist__c to that Id`],
    [...EXCEL_COLS.map((c) => c.label), ...EXCEL_FIXED_COLS.map((c) => c.label)],
  ];
  for (const req of reqs) {
    rows.push([
      ...EXCEL_COLS.map((c) => String(req[c.key] ?? "")),
      ...EXCEL_FIXED_COLS.map((c) => c.value),
    ]);
  }
  return buildXlsxSheet(rows, sheetName);
}

export function downloadChecklistExcel(
  records: ChecklistRecord[],
  userPicklists: Map<string, string[]>,
) {
  const named = records.filter((r) => r.name.trim());
  const loanReqs = named.filter((r) => (r.checklistLevel ?? "Loan") === "Loan");
  const relReqs = named.filter((r) => r.checklistLevel === "Relationship");
  const sheet1 = buildRequirementSheet(loanReqs, "Loan");
  const sheet2 = buildRequirementSheet(relReqs, "Relationship");

  const customValues = getCustomPicklistValues(named, userPicklists);
  let sheetCustom = "";
  if (customValues.size) {
    const customRows: unknown[][] = [
      [
        "⚠️ ACTION REQUIRED — Add these picklist values in Salesforce before importing (Setup > Object Manager > Fields)",
      ],
      ["Picklist Field (Label)", "Object API Name", "Field API Name", "New Value to Add"],
    ];
    const seen = new Set<string>();
    for (const [key, vals] of customValues.entries()) {
      const info = CHECKLIST_PICKLIST_FIELD_MAP[key];
      if (!info) continue;
      for (const val of vals) {
        const dedupeKey = `${key}|${val}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          customRows.push([info.label, info.object, info.field, val]);
        }
      }
    }
    sheetCustom = buildXlsxSheet(customRows, "Custom Picklist Values");
  }

  const placeholderList: string[] = [
    ...(CHECKLIST_PICKLISTS.placeholderName ?? []),
    ...(userPicklists.get("placeholderName") ?? []),
  ];
  const uniquePlaceholders = [...new Set(placeholderList)];
  const phRows: unknown[][] = [
    ["Document Manager Placeholder Name", "Action Required"],
    ...uniquePlaceholders.map((p) => [p, "Verify placeholder exists in Document Manager, or create it before importing."]),
  ];
  const sheetPlaceholders = buildXlsxSheet(phRows, "Document Manager Placeholders");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    sheet1 +
    sheet2 +
    sheetCustom +
    sheetPlaceholders +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "smart-checklist-requirements.xls",
  );
}

export function parseChecklistYaml(text: string): ChecklistRecord[] | string {
  const blocks = text.split(/\n  - object: LLC_BI__Requirement__c/);
  blocks.shift();
  const parsed: ChecklistRecord[] = [];
  for (const block of blocks) {
    const gF = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*"([^"]*)"`, "i"));
      return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "";
    };
    const gB = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*(true|false)`, "i"));
      return m ? m[1] === "true" : false;
    };
    const name = gF("Name");
    if (!name) continue;
    const ph = gF("LLC_BI__Document_Manager_Placeholder__c");
    parsed.push({
      name,
      category: gF("LLC_BI__Category__c") || undefined,
      description: gF("LLC_BI__Description__c") || undefined,
      legalDescription: gF("LLC_BI__Legal_Description__c") || undefined,
      assignedParty: gF("LLC_BI__Assigned_Party__c") || undefined,
      neededBy: gF("LLC_BI__Needed_By__c") || undefined,
      doNotAutoGenerate: gB("LLC_BI__Do_Not_Auto_Generate__c"),
      stageCheck: gB("LLC_BI__Stage_Check__c"),
      placeholderName: ph || undefined,
      criteriaGenerated: gF("LLC_BI__Advanced_Criteria__c") || undefined,
    });
  }
  if (!parsed.length) return "No LLC_BI__Requirement__c records found.";
  return parsed;
}

export function parseChecklistCsvExcel(
  text: string,
): ChecklistRecord[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty or has no data rows.";
  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const colIdx: Partial<Record<keyof ChecklistRecord, number>> = {};
  for (const col of EXCEL_COLS) {
    const i = headers.indexOf(col.label);
    if (i !== -1) colIdx[col.key] = i;
  }
  if (colIdx["name"] === undefined)
    return 'Could not find a "Name" column. Make sure the file was exported from this tool.';
  const parsed: ChecklistRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const get = (key: keyof ChecklistRecord) =>
      colIdx[key] !== undefined ? (cells[colIdx[key]!] || "").trim() : "";
    const getBool = (key: keyof ChecklistRecord) =>
      get(key).toLowerCase() === "true";
    const name = get("name");
    if (!name) continue;
    const ph = get("placeholderName");
    const levelRaw = get("checklistLevel");
    const level: ChecklistLevel = levelRaw === "Relationship" ? "Relationship" : "Loan";
    parsed.push({
      name,
      checklistLevel: level,
      category: get("category") || undefined,
      description: get("description") || undefined,
      legalDescription: get("legalDescription") || undefined,
      assignedParty: get("assignedParty") || undefined,
      neededBy: get("neededBy") || undefined,
      doNotAutoGenerate: getBool("doNotAutoGenerate"),
      stageCheck: getBool("stageCheck"),
      placeholderName: ph || undefined,
      criteriaUserWritten: get("criteriaUserWritten") || undefined,
      criteriaGenerated: get("criteriaGenerated") || undefined,
    });
  }
  if (!parsed.length) return "No rows with a Name value found.";
  return parsed;
}

// ── Collateral Management ─────────────────────────────────────────────────────

export type CollateralPicklists = {
  types: string[];
  subtypesByType: Record<string, string[]>;
};

export function buildCollateralYaml(
  picklists: CollateralPicklists,
  meta: { storyId: string; title: string; featureArea: string },
): string {
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: collateral-management-builder\n  ref: "collateral-management-builder@${today()}"\n\n`;
  y += `# Object: LLC_BI__Collateral_Type__c\n# Fields: LLC_BI__Type__c (Type), LLC_BI__Subtype__c (Sub Type)\n\nrecords:\n\n`;
  for (const type of picklists.types) {
    const subtypes = picklists.subtypesByType[type] ?? [];
    if (!subtypes.length) continue;
    y += `  # ${type}\n`;
    for (const subtype of subtypes) {
      y += `  - object: LLC_BI__Collateral_Type__c\n`;
      y += `    fields:\n`;
      y += `      LLC_BI__Type__c: "${yamlStr(type)}"\n`;
      y += `      LLC_BI__Subtype__c: "${yamlStr(subtype)}"\n\n`;
    }
  }
  return y;
}

export function downloadCollateralYaml(
  picklists: CollateralPicklists,
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildCollateralYaml(picklists, meta);
  downloadBlob(new Blob([yaml], { type: "text/yaml" }), `${slugify(meta.storyId || "collateral")}.yaml`);
}

export type CollateralFieldConfig = {
  collateralType: string;
  collateralSubtype: string;
  sections: { name: string; fields: { name: string; fieldType: string; picklistValues?: string[] }[] }[];
};

export function downloadCollateralExcel(
  picklists: CollateralPicklists,
  fieldConfigs?: CollateralFieldConfig[],
) {
  const rows: unknown[][] = [
    ["LLC_BI__Type__c", "LLC_BI__Subtype__c"],
  ];
  for (const type of picklists.types) {
    for (const subtype of picklists.subtypesByType[type] ?? []) {
      rows.push([type, subtype]);
    }
  }
  if (rows.length === 1) rows.push(["# No collateral types defined", ""]);

  // One sheet per type-subtype combo
  const comboSheets: string[] = [];
  const usedSheetNames = new Set<string>();

  const uniqueSheetName = (raw: string): string => {
    // Strip Excel-invalid chars, truncate to 31
    const base = raw.replace(/[/\\?*[\]:]/g, "-").slice(0, 31);
    if (!usedSheetNames.has(base)) { usedSheetNames.add(base); return base; }
    // Append incrementing suffix until unique
    for (let i = 2; i < 1000; i++) {
      const suffix = ` (${i})`;
      const candidate = base.slice(0, 31 - suffix.length) + suffix;
      if (!usedSheetNames.has(candidate)) { usedSheetNames.add(candidate); return candidate; }
    }
    return base; // fallback (won't happen in practice)
  };

  for (const type of picklists.types) {
    for (const subtype of picklists.subtypesByType[type] ?? []) {
      const config = fieldConfigs?.find(
        (c) => c.collateralType === type && c.collateralSubtype === subtype,
      );
      const sheetName = uniqueSheetName(`${type} - ${subtype}`);

      const sheetRows: unknown[][] = [
        [`Type: ${type}`, `Sub Type: ${subtype}`],
        [""],
      ];

      if (!config || config.sections.length === 0) {
        sheetRows.push(["(No field configuration saved for this combo)"]);
      } else {
        for (const section of config.sections) {
          sheetRows.push([`[SECTION] ${section.name}`, "", ""]);
          sheetRows.push(["Field Name", "Salesforce Type", "Picklist Values"]);
          if (section.fields.length === 0) {
            sheetRows.push(["(No fields)", "", ""]);
          } else {
            for (const field of section.fields) {
              sheetRows.push([
                field.name,
                field.fieldType,
                (field.picklistValues ?? []).join(", "),
              ]);
            }
          }
          sheetRows.push([""]); // blank spacer between sections
        }
      }

      comboSheets.push(buildXlsxSheet(sheetRows, sheetName));
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(rows, "Collateral Types") +
    comboSheets.join("") +
    `</Workbook>`;
  downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }), "collateral-types.xls");
}

export type CollateralRow = { type: string; subtype: string };

export function parseCollateralYaml(text: string): CollateralRow[] | string {
  const blocks = text.split(/\n  - object: LLC_BI__Collateral_Type__c/);
  blocks.shift();
  const parsed: CollateralRow[] = [];
  for (const block of blocks) {
    const getF = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*"([^"]*)"`, "i"));
      return m ? m[1] : "";
    };
    const type = getF("LLC_BI__Type__c");
    const subtype = getF("LLC_BI__Subtype__c");
    if (type && subtype) parsed.push({ type, subtype });
  }
  if (!parsed.length) return "No LLC_BI__Collateral_Type__c records found.";
  return parsed;
}

export function parseCollateralCsv(text: string): CollateralRow[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty.";
  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const typeIdx = headers.findIndex((h) => h === "LLC_BI__Type__c" || h.toLowerCase() === "type");
  const subtypeIdx = headers.findIndex((h) => h === "LLC_BI__Subtype__c" || h.toLowerCase() === "sub type" || h.toLowerCase() === "subtype");
  if (typeIdx === -1 || subtypeIdx === -1) return 'Could not find "LLC_BI__Type__c" and "LLC_BI__Subtype__c" columns.';
  const parsed: CollateralRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const type = (cells[typeIdx] ?? "").trim();
    const subtype = (cells[subtypeIdx] ?? "").trim();
    if (type && subtype) parsed.push({ type, subtype });
  }
  if (!parsed.length) return "No data rows found.";
  return parsed;
}

// ── Document Manager ───────────────────────────────────────────────────────────

export type DocmanLevel = "Relationships" | "Loans" | "Collateral" | "Product Package";

const DOCMAN_LEVELS: DocmanLevel[] = ["Loans", "Relationships", "Collateral", "Product Package"];

// LLC_BI__DocManager__c.LLC_BI__Type__c values (confirmed)
const LEVEL_TYPE_MAP: Record<DocmanLevel, string> = {
  Relationships: "Account",
  Loans: "llc_bi__loan__c",
  Collateral: "LLC_BI__Collateral__c",
  "Product Package": "LLC_BI__Product_Package__c",
};

export type DocmanPlaceholderRecord = {
  name: string;
  level: DocmanLevel;
  category?: string;   // → LLC_BI__DocType__c.Name
  isDefault?: boolean; // no criteria = default template
};

export type DocmanGroupRecord = {
  name: string;
  level: DocmanLevel;
  criteriaUserWritten?: string;
  criteriaFormgen?: string;    // → LLC_BI__ClosingChecklist__c.LLC_BI__Criteria__c
  placeholderNames: string[];
};

export type DocmanExport = {
  placeholders: DocmanPlaceholderRecord[];
  groups: DocmanGroupRecord[];
};

// Collect unique categories per level from placeholders
function getDocTypes(placeholders: DocmanPlaceholderRecord[]): { name: string; level: DocmanLevel }[] {
  const seen = new Set<string>();
  const result: { name: string; level: DocmanLevel }[] = [];
  for (const p of placeholders) {
    if (!p.category) continue;
    const key = `${p.level}|${p.category}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ name: p.category, level: p.level });
    }
  }
  return result;
}

export function buildDocmanYaml(
  data: DocmanExport,
  meta: { storyId: string; title: string; featureArea: string },
): string {
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: document-manager-builder\n  ref: "document-manager-builder@${today()}"\n\n`;

  y += `# ── Level → LLC_BI__DocManager__c.LLC_BI__Type__c mapping ──────────────\n`;
  for (const [level, type] of Object.entries(LEVEL_TYPE_MAP)) {
    y += `#   ${level} → ${type}\n`;
  }
  y += `\n`;

  // DocType records (categories)
  const docTypes = getDocTypes(data.placeholders);
  y += `# ── LLC_BI__DocType__c records (categories) ────────────────────────────\n`;
  y += `doc_types:\n`;
  if (!docTypes.length) {
    y += `  # No categories defined yet.\n`;
  } else {
    for (const dt of docTypes) {
      y += `  - object: LLC_BI__DocType__c\n`;
      y += `    fields:\n`;
      y += `      Name: "${yamlStr(dt.name)}"\n`;
      y += `      LLC_BI__docManager__c: "${LEVEL_TYPE_MAP[dt.level]}"  # DocManager Type__c value\n`;
      y += `\n`;
    }
  }

  // ClosingChecklist records — one per placeholder (default = no criteria, conditional = with criteria)
  y += `# ── LLC_BI__ClosingChecklist__c records (placeholder templates) ────────\n`;
  y += `# Default templates: no LLC_BI__Criteria__c set\n`;
  y += `# Conditional templates: LLC_BI__Criteria__c populated with formgen syntax\n`;
  y += `closing_checklists:\n`;

  // Default templates first
  const defaults = data.placeholders.filter((p) => p.isDefault);
  if (defaults.length) {
    y += `  # Default templates (always generated)\n`;
    for (const p of defaults) {
      y += `  - object: LLC_BI__ClosingChecklist__c\n`;
      y += `    fields:\n`;
      y += `      Name: "${yamlStr(p.name)}"\n`;
      y += `      LLC_BI__docManager__c: "${LEVEL_TYPE_MAP[p.level]}"  # DocManager Type__c value\n`;
      if (p.category) y += `      LLC_BI__docType__c: "${yamlStr(p.category)}"  # DocType Name lookup\n`;
      y += `      # No LLC_BI__Criteria__c — this is a default template\n`;
      y += `\n`;
    }
  }

  // Conditional templates — one record per placeholder per group
  const conditionalGroups = data.groups.filter((g) => g.criteriaFormgen);
  if (conditionalGroups.length) {
    y += `  # Conditional templates (generated when criteria is met)\n`;
    for (const g of conditionalGroups) {
      for (const phName of g.placeholderNames) {
        const ph = data.placeholders.find((p) => p.name === phName && p.level === g.level);
        y += `  - object: LLC_BI__ClosingChecklist__c\n`;
        y += `    fields:\n`;
        y += `      Name: "${yamlStr(phName)}"\n`;
        y += `      LLC_BI__docManager__c: "${LEVEL_TYPE_MAP[g.level]}"  # DocManager Type__c value\n`;
        if (ph?.category) y += `      LLC_BI__docType__c: "${yamlStr(ph.category)}"  # DocType Name lookup\n`;
        y += `      LLC_BI__Criteria__c: "${yamlStr(g.criteriaFormgen)}"`;
        if (g.criteriaUserWritten) y += `  # ${yamlStr(g.criteriaUserWritten)}`;
        y += `\n\n`;
      }
    }
  }

  if (!defaults.length && !conditionalGroups.length) {
    y += `  # No templates configured yet.\n`;
  }

  return y;
}

export function downloadDocmanYaml(
  data: DocmanExport,
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildDocmanYaml(data, meta);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "document-manager")}.yaml`,
  );
}

export function downloadDocmanExcel(data: DocmanExport) {
  // Sheet 1: All placeholders
  const phRows: unknown[][] = [
    ["Level (UI)", "Category", "Name", "Is Default Docman Placeholder", "Criteria"],
    ...data.placeholders.map((p) => {
      const criteria = data.groups
        .filter((g) => g.level === p.level && g.placeholderNames.includes(p.name))
        .map((g) => g.criteriaUserWritten ?? g.criteriaFormgen ?? "")
        .filter(Boolean)
        .join(" | ");
      return [p.level, p.category ?? "", p.name, p.isDefault ? "true" : "false", criteria];
    }),
  ];
  if (!data.placeholders.length) phRows.push(["# No placeholders defined", "", "", "", ""]);
  const sheet1 = buildXlsxSheet(phRows, "Placeholders");

  // Sheet 2: LLC_BI__DocType__c records
  const docTypes = getDocTypes(data.placeholders);
  const dtRows: unknown[][] = [
    ["object", "Name", "LLC_BI__docManager__c (DocManager Type__c value)"],
    ...docTypes.map((dt) => ["LLC_BI__DocType__c", dt.name, LEVEL_TYPE_MAP[dt.level]]),
  ];
  if (!docTypes.length) dtRows.push(["", "# No categories defined", ""]);
  const sheet2a = buildXlsxSheet(dtRows, "DocTypes (Categories)");

  // Sheet 3: LLC_BI__ClosingChecklist__c — Default Docman Placeholders
  const defaults = data.placeholders.filter((p) => p.isDefault);
  const defRows: unknown[][] = [
    ["object", "Name", "LLC_BI__docManager__c", "LLC_BI__docType__c (Category)", "LLC_BI__Criteria__c", "Level (UI)", "Notes"],
    ...defaults.map((p) => [
      "LLC_BI__ClosingChecklist__c",
      p.name,
      LEVEL_TYPE_MAP[p.level],
      p.category ?? "",
      "",
      p.level,
      "Default template — no criteria",
    ]),
  ];
  if (!defaults.length) defRows.push(["", "# No default templates", "", "", "", "", ""]);
  const sheet3 = buildXlsxSheet(defRows, "Default Docman Placeholders");

  // Sheet 4: LLC_BI__ClosingChecklist__c — Conditional Templates
  const condRows: unknown[][] = [
    ["object", "Name", "LLC_BI__docManager__c", "LLC_BI__docType__c (Category)", "LLC_BI__Criteria__c", "Criteria (Plain English)", "Level (UI)", "Condition Group"],
  ];
  for (const g of data.groups.filter((g) => g.criteriaFormgen)) {
    for (const phName of g.placeholderNames) {
      const ph = data.placeholders.find((p) => p.name === phName && p.level === g.level);
      condRows.push([
        "LLC_BI__ClosingChecklist__c",
        phName,
        LEVEL_TYPE_MAP[g.level],
        ph?.category ?? "",
        g.criteriaFormgen ?? "",
        g.criteriaUserWritten ?? "",
        g.level,
        g.name,
      ]);
    }
  }
  if (condRows.length === 1) condRows.push(["", "# No conditional templates", "", "", "", "", "", ""]);
  const sheet4 = buildXlsxSheet(condRows, "Conditional Templates");

  // Sheet 5: Level reference
  const refRows: unknown[][] = [
    ["UI Level", "LLC_BI__DocManager__c.LLC_BI__Type__c value"],
    ...DOCMAN_LEVELS.map((l) => [l, LEVEL_TYPE_MAP[l]]),
  ];
  const sheet5 = buildXlsxSheet(refRows, "Level Reference");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    sheet1 + sheet2a + sheet3 + sheet4 + sheet5 +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "document-manager.xls",
  );
}

export function parseDocmanYaml(text: string): DocmanExport | string {
  const placeholders: DocmanPlaceholderRecord[] = [];
  const groups: DocmanGroupRecord[] = [];

  // Parse closing_checklists block — reconstruct placeholders and groups
  const clSection = text.match(/^closing_checklists:\n([\s\S]*)$/m);
  if (clSection) {
    const items = clSection[1].split(/\n  - object: LLC_BI__ClosingChecklist__c/);
    items.shift();
    const conditionalMap = new Map<string, DocmanGroupRecord>();

    for (const item of items) {
      const name = item.match(/Name:\s*"([^"]*)"/)?.[1];
      const docManagerType = item.match(/LLC_BI__docManager__c:\s*"([^"]*)"/)?.[1];
      const category = item.match(/LLC_BI__docType__c:\s*"([^"]*)"/)?.[1];
      const criteria = item.match(/LLC_BI__Criteria__c:\s*"([^"]*)"/)?.[1];
      const criteriaComment = item.match(/LLC_BI__Criteria__c:.*#\s*(.+)/)?.[1]?.trim();

      if (!name || !docManagerType) continue;

      // Reverse-map docManagerType → level
      const level = (Object.entries(LEVEL_TYPE_MAP).find(([, v]) => v === docManagerType)?.[0] ?? null) as DocmanLevel | null;
      if (!level) continue;

      // Upsert placeholder
      if (!placeholders.find((p) => p.name === name && p.level === level)) {
        placeholders.push({ name, level, category, isDefault: !criteria || undefined });
      }

      if (criteria) {
        // Group by criteria string + level
        const groupKey = `${level}|${criteria}`;
        if (!conditionalMap.has(groupKey)) {
          conditionalMap.set(groupKey, {
            name: criteriaComment ?? "Imported condition",
            level,
            criteriaFormgen: criteria,
            criteriaUserWritten: criteriaComment,
            placeholderNames: [],
          });
        }
        conditionalMap.get(groupKey)!.placeholderNames.push(name);
      }
    }
    groups.push(...conditionalMap.values());
  }

  if (!placeholders.length && !groups.length) {
    return "No closing checklist records found. Make sure the file was exported from this tool.";
  }
  return { placeholders, groups };
}

export function parseDocmanExcel(text: string): DocmanExport | string {
  // Parses the Default Templates or Conditional Templates sheet saved as CSV
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty.";

  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const nameIdx = headers.findIndex((h) => h === "Name");
  const levelIdx = headers.findIndex((h) => h === "Level (UI)");
  const categoryIdx = headers.findIndex((h) => h.includes("docType") || h.toLowerCase().includes("category"));
  const isDefaultIdx = headers.findIndex((h) => h.toLowerCase().includes("is default"));
  const criteriaIdx = headers.findIndex((h) => h === "LLC_BI__Criteria__c" || h.toLowerCase() === "criteria");
  const criteriaPlainIdx = headers.findIndex((h) => h.toLowerCase().includes("plain english"));
  const groupIdx = headers.findIndex((h) => h === "Condition Group");

  if (nameIdx === -1 || levelIdx === -1) {
    return 'Could not find "Name" and "Level (UI)" columns. Export the YAML file for re-importing.';
  }

  const placeholders: DocmanPlaceholderRecord[] = [];
  const conditionalMap = new Map<string, DocmanGroupRecord>();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const name = (cells[nameIdx] ?? "").trim();
    const level = (cells[levelIdx] ?? "").trim() as DocmanLevel;
    if (!name || !DOCMAN_LEVELS.includes(level)) continue;
    const category = categoryIdx !== -1 ? (cells[categoryIdx] ?? "").trim() || undefined : undefined;
    const criteria = criteriaIdx !== -1 ? (cells[criteriaIdx] ?? "").trim() || undefined : undefined;
    const criteriaPlain = criteriaPlainIdx !== -1 ? (cells[criteriaPlainIdx] ?? "").trim() || undefined : undefined;
    const groupName = groupIdx !== -1 ? (cells[groupIdx] ?? "").trim() || undefined : undefined;
    const isDefault = isDefaultIdx !== -1
      ? (cells[isDefaultIdx] ?? "").trim().toLowerCase() === "true"
      : false;

    if (!placeholders.find((p) => p.name === name && p.level === level)) {
      placeholders.push({ name, level, category, isDefault: isDefault || undefined });
    }
    if (criteria) {
      const key = `${level}|${criteria}`;
      if (!conditionalMap.has(key)) {
        conditionalMap.set(key, {
          name: groupName ?? criteriaPlain ?? "Imported condition",
          level,
          criteriaFormgen: criteria,
          criteriaUserWritten: criteriaPlain,
          placeholderNames: [],
        });
      }
      conditionalMap.get(key)!.placeholderNames.push(name);
    }
  }

  if (!placeholders.length) return "No placeholder rows found.";
  return { placeholders, groups: [...conditionalMap.values()] };
}

// ── Conditions Builder ─────────────────────────────────────────────────────────

export type ConditionType = "Condition Precedent" | "Condition Subsequent";

export type ConditionRecord = {
  name: string;
  conditionType: ConditionType;
  category?: string;
  assignedParty?: string;
  description?: string;
  legalDescription?: string;
};

const CONDITION_EXCEL_COLS: { key: keyof ConditionRecord; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "conditionType", label: "LLC_BI__Requirement_Type__c" },
  { key: "category", label: "LLC_BI__Category__c" },
  { key: "description", label: "LLC_BI__Description__c" },
  { key: "legalDescription", label: "LLC_BI__Legal_Description__c" },
  { key: "assignedParty", label: "LLC_BI__Assigned_Party__c" },
];

const CONDITION_EXCEL_FIXED_COLS: { label: string; value: string }[] = [];

const CONDITION_TYPES: ConditionType[] = ["Condition Precedent", "Condition Subsequent"];

function buildConditionsYamlSection(reqs: ConditionRecord[], conditionType: ConditionType): string {
  let y = `# ${"─".repeat(70)}\n`;
  y += `# ${conditionType.toUpperCase()} CONDITIONS\n`;
  y += `# ${"─".repeat(70)}\n\n`;
  for (const req of reqs) {
    y += `  - object: LLC_BI__Requirement__c\n    fields:\n`;
    y += `      Name: "${yamlStr(req.name)}"\n`;
    y += `      LLC_BI__Requirement_Type__c: "${yamlStr(req.conditionType)}"\n`;
    if (req.category) y += `      LLC_BI__Category__c: "${yamlStr(req.category)}"\n`;
    if (req.assignedParty) y += `      LLC_BI__Assigned_Party__c: "${yamlStr(req.assignedParty)}"\n`;
    if (req.description) y += `      LLC_BI__Description__c: "${yamlStr(req.description)}"\n`;
    if (req.legalDescription) y += `      LLC_BI__Legal_Description__c: "${yamlStr(req.legalDescription)}"\n`;
    y += `\n`;
  }
  return y;
}

export function buildConditionsYaml(
  records: ConditionRecord[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  const named = records.filter((r) => r.name.trim());
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: conditions-builder\n  ref: "conditions-builder@${today()}"\n\nrecords:\n\n`;
  if (!named.length) {
    y += "  # No named conditions yet.\n";
    return y;
  }
  const precedentReqs = named.filter((r) => r.conditionType === "Condition Precedent");
  const subsequentReqs = named.filter((r) => r.conditionType === "Condition Subsequent");
  if (precedentReqs.length) y += buildConditionsYamlSection(precedentReqs, "Condition Precedent");
  if (subsequentReqs.length) y += buildConditionsYamlSection(subsequentReqs, "Condition Subsequent");
  return y;
}

export function downloadConditionsYaml(
  records: ConditionRecord[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildConditionsYaml(records, meta);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "conditions")}.yaml`,
  );
}

function buildConditionSheet(reqs: ConditionRecord[], conditionType: ConditionType): string {
  const sheetName =
    conditionType === "Condition Precedent" ? "Condition Precedent" : "Condition Subsequent";
  const rows: unknown[][] = [
    [...CONDITION_EXCEL_COLS.map((c) => c.label), ...CONDITION_EXCEL_FIXED_COLS.map((c) => c.label)],
  ];
  for (const req of reqs) {
    rows.push([
      ...CONDITION_EXCEL_COLS.map((c) => String(req[c.key] ?? "")),
      ...CONDITION_EXCEL_FIXED_COLS.map((c) => c.value),
    ]);
  }
  return buildXlsxSheet(rows, sheetName);
}

export function downloadConditionsExcel(records: ConditionRecord[]) {
  const named = records.filter((r) => r.name.trim());
  const precedentReqs = named.filter((r) => r.conditionType === "Condition Precedent");
  const subsequentReqs = named.filter((r) => r.conditionType === "Condition Subsequent");
  const sheet1 = buildConditionSheet(precedentReqs, "Condition Precedent");
  const sheet2 = buildConditionSheet(subsequentReqs, "Condition Subsequent");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    sheet1 +
    sheet2 +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "conditions.xls",
  );
}

export function parseConditionsYaml(text: string): ConditionRecord[] | string {
  const blocks = text.split(/\n  - object: LLC_BI__Requirement__c/);
  blocks.shift();
  const parsed: ConditionRecord[] = [];
  for (const block of blocks) {
    const gF = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*"([^"]*)"`, "i"));
      return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "";
    };
    const gB = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*(true|false)`, "i"));
      return m ? m[1] === "true" : false;
    };
    const name = gF("Name");
    if (!name) continue;
    const conditionTypeRaw = gF("LLC_BI__Requirement_Type__c");
    // Skip records that are not condition types (e.g. plain checklist reqs)
    if (conditionTypeRaw && !CONDITION_TYPES.includes(conditionTypeRaw as ConditionType)) continue;
    const conditionType: ConditionType =
      conditionTypeRaw === "Condition Subsequent"
        ? "Condition Subsequent"
        : "Condition Precedent";
    parsed.push({
      name,
      conditionType,
      category: gF("LLC_BI__Category__c") || undefined,
      assignedParty: gF("LLC_BI__Assigned_Party__c") || undefined,
      description: gF("LLC_BI__Description__c") || undefined,
      legalDescription: gF("LLC_BI__Legal_Description__c") || undefined,
    });
  }
  if (!parsed.length) return "No LLC_BI__Requirement__c condition records found.";
  return parsed;
}

export function parseConditionsCsvExcel(text: string): ConditionRecord[] | string {
  const raw = text.replace(/^\uFEFF/, "");

  // SpreadsheetML XML (exported by this tool, possibly re-saved by Excel)
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<Workbook")) {
    return parseConditionsSpreadsheetML(raw);
  }

  // Plain CSV fallback
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty or has no data rows.";
  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const colIdx: Partial<Record<keyof ConditionRecord, number>> = {};
  for (const col of CONDITION_EXCEL_COLS) {
    const i = headers.indexOf(col.label);
    if (i !== -1) colIdx[col.key] = i;
  }
  if (colIdx["name"] === undefined)
    return 'Could not find a "Name" column. Make sure the file was exported from this tool.';
  const parsed: ConditionRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const get = (key: keyof ConditionRecord) =>
      colIdx[key] !== undefined ? (cells[colIdx[key]!] || "").trim() : "";
    const name = get("name");
    if (!name) continue;
    const conditionTypeRaw = get("conditionType");
    const conditionType: ConditionType =
      conditionTypeRaw === "Condition Subsequent" ? "Condition Subsequent" : "Condition Precedent";
    parsed.push({
      name,
      conditionType,
      category: get("category") || undefined,
      assignedParty: get("assignedParty") || undefined,
      description: get("description") || undefined,
      legalDescription: get("legalDescription") || undefined,
    });
  }
  if (!parsed.length) return "No rows with a Name value found.";
  return parsed;
}

function parseConditionsSpreadsheetML(xml: string): ConditionRecord[] | string {
  // Decode XML entities
  const decode = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
     .replace(/&quot;/g, '"').replace(/&#160;/g, " ").replace(/&apos;/g, "'").trim();

  // Extract all rows from all worksheets as arrays of cell strings
  const rowPattern = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
  const cellPattern = /<Cell[^>]*>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/gi;

  const allRows: string[][] = [];
  let rowMatch;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const rowXml = rowMatch[1];
    const cells: string[] = [];
    let cellMatch;
    const cellRe = new RegExp(cellPattern.source, "gi");
    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      cells.push(decode(cellMatch[1]));
    }
    if (cells.length > 0) allRows.push(cells);
  }

  if (allRows.length < 2) return "File appears empty or has no data rows.";

  // Find the header row (first row containing "Name")
  const headerRowIdx = allRows.findIndex((r) => r.includes("Name"));
  if (headerRowIdx === -1) return 'Could not find a "Name" column. Make sure the file was exported from this tool.';

  const headers = allRows[headerRowIdx];
  const colIdx: Partial<Record<keyof ConditionRecord, number>> = {};
  for (const col of CONDITION_EXCEL_COLS) {
    const i = headers.indexOf(col.label);
    if (i !== -1) colIdx[col.key] = i;
  }

  const parsed: ConditionRecord[] = [];
  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const get = (key: keyof ConditionRecord) =>
      colIdx[key] !== undefined ? (cells[colIdx[key]!] ?? "").trim() : "";
    const name = get("name");
    if (!name) continue;
    const conditionTypeRaw = get("conditionType");
    const conditionType: ConditionType =
      conditionTypeRaw === "Condition Subsequent" ? "Condition Subsequent" : "Condition Precedent";
    parsed.push({
      name,
      conditionType,
      category: get("category") || undefined,
      assignedParty: get("assignedParty") || undefined,
      description: get("description") || undefined,
      legalDescription: get("legalDescription") || undefined,
    });
  }
  if (!parsed.length) return "No condition rows found in file.";
  return parsed;
}

// ── Policy Exceptions Builder ──────────────────────────────────────────────────

export type PolicyExceptionMitigationReason = {
  reason: string;
  commentRequired: boolean;
};

export type PolicyExceptionRecord = {
  type: string;
  name: string;
  severities: string[];
  mitigationReasons: PolicyExceptionMitigationReason[];
};

export function buildPolicyExceptionsYaml(
  records: PolicyExceptionRecord[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  const named = records.filter((r) => r.name.trim());
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: policy-exceptions-builder\n  ref: "policy-exceptions-builder@${today()}"\n\n`;
  y += `# ── Salesforce object reference ─────────────────────────────────────────\n`;
  y += `# Templates  → LLC_BI__Policy_Exception_Template__c\n`;
  y += `#   Name                  → Name\n`;
  y += `#   Type                  → LLC_BI__Type__c\n`;
  y += `#   Severities            → LLC_BI__Severities__c  (semicolon-separated, e.g. Minor;Major;Critical)\n`;
  y += `#\n`;
  y += `# Mitigation reasons → LLC_BI__Policy_Exception_Mitigation_Reason__c\n`;
  y += `#   One record per reason; lookup to template via LLC_BI__Policy_Exception_Template__c\n`;
  y += `#   Reason text           → LLC_BI__Reason__c\n`;
  y += `#   Comment required flag → LLC_BI__Comment_Required__c\n`;
  y += `# ────────────────────────────────────────────────────────────────────────\n\n`;
  y += `records:\n\n`;

  if (!named.length) {
    y += "  # No policy exceptions configured yet.\n";
    return y;
  }

  for (const exc of named) {
    y += `  # Template record\n`;
    y += `  - object: LLC_BI__Policy_Exception_Template__c\n`;
    y += `    fields:\n`;
    y += `      Name: "${yamlStr(exc.name)}"\n`;
    y += `      LLC_BI__Type__c: "${yamlStr(exc.type)}"\n`;
    if (exc.severities.length) {
      y += `      LLC_BI__Severities__c: "${exc.severities.join(";")}"\n`;
    }
    y += `\n`;
    if (exc.mitigationReasons.length) {
      y += `  # Mitigation reasons for "${yamlStr(exc.name)}" (lookup: LLC_BI__Policy_Exception_Template__c)\n`;
      for (const mr of exc.mitigationReasons) {
        if (!mr.reason.trim()) continue;
        y += `  - object: LLC_BI__Policy_Exception_Mitigation_Reason__c\n`;
        y += `    fields:\n`;
        y += `      LLC_BI__Policy_Exception_Template__c: ref:Name:"${yamlStr(exc.name)}"\n`;
        y += `      LLC_BI__Reason__c: "${yamlStr(mr.reason)}"\n`;
        y += `      LLC_BI__Comment_Required__c: ${mr.commentRequired}\n`;
        y += `\n`;
      }
    }
  }
  return y;
}

export function downloadPolicyExceptionsYaml(
  records: PolicyExceptionRecord[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildPolicyExceptionsYaml(records, meta);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "policy-exceptions")}.yaml`,
  );
}

export function downloadPolicyExceptionsExcel(records: PolicyExceptionRecord[]) {
  const named = records.filter((r) => r.name.trim());

  // Sheet 1: LLC_BI__Policy_Exception_Template__c
  const excRows: unknown[][] = [
    ["object", "Name", "LLC_BI__Type__c", "LLC_BI__Severities__c"],
    ...named.map((r) => [
      "LLC_BI__Policy_Exception_Template__c",
      r.name,
      r.type,
      r.severities.join(";"),
    ]),
  ];
  if (named.length === 0) excRows.push(["# No exceptions defined", "", "", ""]);

  // Sheet 2: LLC_BI__Policy_Exception_Mitigation_Reason__c (one row per reason)
  const mrRows: unknown[][] = [
    ["object", "LLC_BI__Policy_Exception_Template__c (Name lookup)", "LLC_BI__Reason__c", "LLC_BI__Comment_Required__c"],
  ];
  for (const exc of named) {
    for (const mr of exc.mitigationReasons) {
      if (!mr.reason.trim()) continue;
      mrRows.push([
        "LLC_BI__Policy_Exception_Mitigation_Reason__c",
        exc.name,
        mr.reason,
        mr.commentRequired ? "true" : "false",
      ]);
    }
  }
  if (mrRows.length === 1) mrRows.push(["# No mitigation reasons defined", "", "", ""]);

  // Sheet 3: Salesforce object reference
  const refRows: unknown[][] = [
    ["Object", "Field (API Name)", "Description"],
    ["LLC_BI__Policy_Exception_Template__c", "Name", "Exception name"],
    ["LLC_BI__Policy_Exception_Template__c", "LLC_BI__Type__c", "Exception type"],
    ["LLC_BI__Policy_Exception_Template__c", "LLC_BI__Severities__c", "Severities (semicolon-separated, e.g. Minor;Major;Critical)"],
    ["LLC_BI__Policy_Exception_Mitigation_Reason__c", "LLC_BI__Policy_Exception_Template__c", "Lookup to LLC_BI__Policy_Exception_Template__c (by Name)"],
    ["LLC_BI__Policy_Exception_Mitigation_Reason__c", "LLC_BI__Reason__c", "Mitigation reason text"],
    ["LLC_BI__Policy_Exception_Mitigation_Reason__c", "LLC_BI__Comment_Required__c", "Boolean — whether a comment is required when selecting this reason"],
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(excRows, "Policy Exception Templates") +
    buildXlsxSheet(mrRows, "Mitigation Reasons") +
    buildXlsxSheet(refRows, "SF Object Reference") +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "policy-exceptions.xls",
  );
}

// ── Fees Builder ──────────────────────────────────────────────────────────────

function parseProductName(prod: string): { productLine: string; productType: string; productName: string } {
  const firstDash = prod.indexOf("-");
  const lastDash = prod.lastIndexOf("-");
  if (firstDash === -1 || firstDash === lastDash) {
    return { productLine: prod.trim(), productType: "", productName: "" };
  }
  return {
    productLine: prod.slice(0, firstDash).trim(),
    productType: prod.slice(firstDash + 1, lastDash).trim(),
    productName: prod.slice(lastDash + 1).trim(),
  };
}

export type FeeRecord = {
  name: string;
  feePaidBy?: string;
  calculationType?: "Flat Amount" | "Percentage";
  basisSource?: string;
  percentage?: number;
  amount?: number;
  collectionMethod?: string;
  autoApply?: boolean;
  appliedToProducts?: string[];
  notes?: string;
};

export function buildFeesYaml(
  records: FeeRecord[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  const named = records.filter((r) => r.name.trim());
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: fees-builder\n  ref: "fees-builder@${today()}"\n\n`;
  y += `# ── Salesforce object reference ─────────────────────────────────────────\n`;
  y += `# Step 1 — Fee templates: LLC_BI__Template_Records__c\n`;
  y += `#   LLC_BI__Category__c          → "Fee Management"  (fixed value)\n`;
  y += `#   LLC_BI__Picklist_1__c        → Fee Name\n`;
  y += `#   LLC_BI__Picklist_2__c        → Fee Paid By\n`;
  y += `#   LLC_BI__Picklist_4__c        → Calculation Type  ("Flat Amount" | "Percentage")\n`;
  y += `#   LLC_BI__Basis_Source__c      → Basis Source  (only when Calculation Type = Percentage)\n`;
  y += `#   LLC_BI__Percentage__c        → Percentage  (only when Calculation Type = Percentage)\n`;
  y += `#   LLC_BI__Collection_Method__c → Collection Method\n`;
  y += `#\n`;
  y += `# Step 2 — Product assignments: LLC_BI__Product_Template_Join__c\n`;
  y += `#   One record per fee × product combination.\n`;
  y += `#   LLC_BI__Template_Records__c  → lookup to the fee template (by LLC_BI__Picklist_1__c / Name)\n`;
  y += `#   LLC_BI__Product__c           → lookup to LLC_BI__Product__c resolved by matching all three:\n`;
  y += `#                                   LLC_BI__Product__r.LLC_BI__Product_Line_Name__c\n`;
  y += `#                                   LLC_BI__Product__r.LLC_BI__Product_Type_Name__c\n`;
  y += `#                                   LLC_BI__Product__r.Name\n`;
  y += `# ────────────────────────────────────────────────────────────────────────\n\n`;
  y += `records:\n\n`;

  if (!named.length) {
    y += "  # No fees configured yet.\n";
    return y;
  }

  // Step 1: fee template records
  y += `  # ${"─".repeat(66)}\n`;
  y += `  # STEP 1 — Fee Templates (LLC_BI__Template_Records__c)\n`;
  y += `  # ${"─".repeat(66)}\n\n`;

  for (const fee of named) {
    y += `  - object: LLC_BI__Template_Records__c\n`;
    y += `    fields:\n`;
    y += `      LLC_BI__Category__c: "Fee Management"\n`;
    y += `      LLC_BI__Picklist_1__c: "${yamlStr(fee.name)}"\n`;
    if (fee.feePaidBy) y += `      LLC_BI__Picklist_2__c: "${yamlStr(fee.feePaidBy)}"\n`;
    if (fee.calculationType) y += `      LLC_BI__Picklist_4__c: "${yamlStr(fee.calculationType)}"\n`;
    if (fee.calculationType === "Percentage") {
      if (fee.basisSource) y += `      LLC_BI__Basis_Source__c: "${yamlStr(fee.basisSource)}"\n`;
      if (fee.percentage !== undefined) y += `      LLC_BI__Percentage__c: ${fee.percentage}\n`;
    }
    if (fee.calculationType === "Flat Amount" && fee.amount !== undefined) {
      y += `      LLC_BI__Currency_Field_1__c: ${fee.amount}\n`;
    }
    if (fee.collectionMethod) y += `      LLC_BI__Collection_Method__c: "${yamlStr(fee.collectionMethod)}"\n`;
    if (fee.notes) y += `      # Notes: ${yamlStr(fee.notes)}\n`;
    y += `\n`;
  }

  // Step 2: product template join records
  const joinFees = named.filter((f) => f.autoApply && f.appliedToProducts && f.appliedToProducts.length > 0);
  if (joinFees.length) {
    y += `  # ${"─".repeat(66)}\n`;
    y += `  # STEP 2 — Product Assignments (LLC_BI__Product_Template_Join__c)\n`;
    y += `  # Populate LLC_BI__Product__c by querying LLC_BI__Product__c where\n`;
    y += `  # LLC_BI__Product_Line_Name__c, LLC_BI__Product_Type_Name__c, and Name all match.\n`;
    y += `  # ${"─".repeat(66)}\n\n`;

    for (const fee of joinFees) {
      for (const prod of fee.appliedToProducts!) {
        const { productLine, productType, productName } = parseProductName(prod);
        y += `  - object: LLC_BI__Product_Template_Join__c\n`;
        y += `    fields:\n`;
        y += `      LLC_BI__Template_Records__c: ref:LLC_BI__Picklist_1__c:"${yamlStr(fee.name)}"  # fee template\n`;
        y += `      LLC_BI__Product__r.LLC_BI__Product_Line_Name__c: "${yamlStr(productLine)}"\n`;
        y += `      LLC_BI__Product__r.LLC_BI__Product_Type_Name__c: "${yamlStr(productType)}"\n`;
        y += `      LLC_BI__Product__r.Name: "${yamlStr(productName || prod)}"\n`;
        y += `      LLC_BI__Product__c: ref:Name:"${yamlStr(productName || prod)}"  # resolve Id by matching all three fields above\n`;
        y += `\n`;
      }
    }
  }

  return y;
}

export function downloadFeesYaml(
  records: FeeRecord[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildFeesYaml(records, meta);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "fees")}.yaml`,
  );
}

export function downloadFeesExcel(records: FeeRecord[]) {
  const named = records.filter((r) => r.name.trim());

  // Sheet 1: Fees — one row per fee with SF API column headers
  const feeRows: unknown[][] = [
    [
      "object",
      "LLC_BI__Category__c",
      "LLC_BI__Picklist_1__c (Fee Name)",
      "LLC_BI__Picklist_2__c (Fee Paid By)",
      "LLC_BI__Picklist_4__c (Calculation Type)",
      "LLC_BI__Basis_Source__c",
      "LLC_BI__Percentage__c",
      "LLC_BI__Collection_Method__c",
      "LLC_BI__Currency_Field_1__c (Flat Amount)",
      "Applied To Products (reference — product wiring done in Product Hierarchy Builder)",
      "Notes",
    ],
  ];

  for (const fee of named) {
    feeRows.push([
      "LLC_BI__Template_Records__c",
      "Fee Management",
      fee.name,
      fee.feePaidBy ?? "",
      fee.calculationType ?? "",
      fee.calculationType === "Percentage" ? (fee.basisSource ?? "") : "",
      fee.calculationType === "Percentage" && fee.percentage !== undefined ? fee.percentage : "",
      fee.collectionMethod ?? "",
      fee.calculationType === "Flat Amount" && fee.amount !== undefined ? fee.amount : "",
      fee.autoApply && fee.appliedToProducts ? fee.appliedToProducts.join(";") : "",
      fee.notes ?? "",
    ]);
  }
  if (named.length === 0) {
    feeRows.push(["# No fees defined", "", "", "", "", "", "", "", "", "", ""]);
  }

  // Sheet 2: Product Template Join records — one row per fee × product
  const joinRows: unknown[][] = [
    [
      "object",
      "LLC_BI__Template_Records__c (fee name — resolve to Id)",
      "LLC_BI__Product__r.Name",
      "LLC_BI__Product__r.LLC_BI__Product_Line_Name__c",
      "LLC_BI__Product__r.LLC_BI__Product_Type_Name__c",
      "LLC_BI__Product__c (resolve Id by matching all three product fields above)",
    ],
  ];
  for (const fee of named) {
    if (!fee.autoApply || !fee.appliedToProducts?.length) continue;
    for (const prod of fee.appliedToProducts) {
      const { productLine, productType, productName } = parseProductName(prod);
      joinRows.push([
        "LLC_BI__Product_Template_Join__c",
        fee.name,
        productName || prod,
        productLine,
        productType,
        "<resolve: query LLC_BI__Product__c where Name, Product Line Name, and Product Type Name all match>",
      ]);
    }
  }
  if (joinRows.length === 1) joinRows.push(["# No product assignments defined", "", "", "", "", ""]);

  // Sheet 3: SF Object Reference
  const refRows: unknown[][] = [
    ["Object", "Field (API Name)", "Description"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Category__c", "Fixed value: \"Fee Management\""],
    ["LLC_BI__Template_Records__c", "LLC_BI__Picklist_1__c", "Fee name"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Picklist_2__c", "Fee Paid By (Borrower | Lender)"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Picklist_4__c", "Calculation Type (Flat Amount | Percentage)"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Basis_Source__c", "Basis for percentage calculation (e.g. Loan Amount) — only when Calculation Type = Percentage"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Percentage__c", "Percentage value — only when Calculation Type = Percentage"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Collection_Method__c", "How the fee is collected (Deducted from Loan | Add to Loan | Cash)"],
    ["LLC_BI__Template_Records__c", "LLC_BI__Currency_Field_1__c", "Flat amount value — only when Calculation Type = Flat Amount"],
    ["", "", ""],
    ["LLC_BI__Product_Template_Join__c", "LLC_BI__Template_Records__c", "Lookup to the fee template record (LLC_BI__Template_Records__c)"],
    ["LLC_BI__Product_Template_Join__c", "LLC_BI__Product__c", "Lookup to LLC_BI__Product__c — resolve Id by matching LLC_BI__Product__r.Name + LLC_BI__Product__r.LLC_BI__Product_Line_Name__c + LLC_BI__Product__r.LLC_BI__Product_Type_Name__c"],
    ["LLC_BI__Product_Template_Join__c", "LLC_BI__Product__r.Name", "Product name (for resolution only)"],
    ["LLC_BI__Product_Template_Join__c", "LLC_BI__Product__r.LLC_BI__Product_Line_Name__c", "Product Line name (for resolution only)"],
    ["LLC_BI__Product_Template_Join__c", "LLC_BI__Product__r.LLC_BI__Product_Type_Name__c", "Product Type name (for resolution only)"],
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(feeRows, "Fee Templates") +
    buildXlsxSheet(joinRows, "Product Assignments") +
    buildXlsxSheet(refRows, "SF Object Reference") +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "fees.xls",
  );
}

function parseFeesRows(rows: string[][]): FeeRecord[] | string {
  if (rows.length < 2) return "File appears empty or has no data rows.";

  // Find header row — look for the fee name column
  const headerRowIdx = rows.findIndex((r) =>
    r.some((c) => c.includes("LLC_BI__Picklist_1__c")),
  );
  if (headerRowIdx === -1)
    return 'Could not find "LLC_BI__Picklist_1__c (Fee Name)" column. Make sure the file was exported from this tool.';

  const headers = rows[headerRowIdx];
  const col = (label: string) => headers.findIndex((h) => h === label);

  const nameIdx = col("LLC_BI__Picklist_1__c (Fee Name)");
  const feePaidByIdx = col("LLC_BI__Picklist_2__c (Fee Paid By)");
  const calcTypeIdx = col("LLC_BI__Picklist_4__c (Calculation Type)");
  const basisIdx = col("LLC_BI__Basis_Source__c");
  const pctIdx = col("LLC_BI__Percentage__c");
  const collectionIdx = col("LLC_BI__Collection_Method__c");
  const amountIdx = col("LLC_BI__Currency_Field_1__c (Flat Amount)");
  const productsIdx = col("Applied To Products (reference — product wiring done in Product Hierarchy Builder)");
  const notesIdx = col("Notes");

  const get = (cells: string[], idx: number) => idx !== -1 ? (cells[idx] ?? "").trim() : "";

  const parsed: FeeRecord[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const cells = rows[i];
    const name = get(cells, nameIdx);
    if (!name || name.startsWith("#")) continue;
    const calcTypeRaw = get(cells, calcTypeIdx);
    const calculationType =
      calcTypeRaw === "Flat Amount" || calcTypeRaw === "Percentage" ? calcTypeRaw : undefined;
    const pctRaw = get(cells, pctIdx);
    const amountRaw = get(cells, amountIdx);
    const productsRaw = get(cells, productsIdx);
    parsed.push({
      name,
      feePaidBy: get(cells, feePaidByIdx) || undefined,
      calculationType,
      basisSource: calculationType === "Percentage" ? get(cells, basisIdx) || undefined : undefined,
      percentage: calculationType === "Percentage" && pctRaw ? parseFloat(pctRaw) : undefined,
      amount: calculationType === "Flat Amount" && amountRaw ? parseFloat(amountRaw) : undefined,
      collectionMethod: get(cells, collectionIdx) || undefined,
      autoApply: productsRaw ? true : undefined,
      appliedToProducts: productsRaw ? productsRaw.split(";").map((p) => p.trim()).filter(Boolean) : undefined,
      notes: get(cells, notesIdx) || undefined,
    });
  }
  if (!parsed.length) return "No fee rows found.";
  return parsed;
}

function parseFeesSpreadsheetML(xml: string): FeeRecord[] | string {
  const decode = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
     .replace(/&quot;/g, '"').replace(/&#160;/g, " ").replace(/&apos;/g, "'").trim();

  // Extract only the "Fee Templates" worksheet — ignore Product Assignments, SF Object Reference, etc.
  const worksheetPattern = /<Worksheet[^>]*ss:Name="([^"]*)"[^>]*>([\s\S]*?)<\/Worksheet>/gi;
  let feeTemplatesXml: string | null = null;
  let wsMatch;
  while ((wsMatch = worksheetPattern.exec(xml)) !== null) {
    if (wsMatch[1] === "Fee Templates") {
      feeTemplatesXml = wsMatch[2];
      break;
    }
  }
  // Fall back to full xml if sheet not found (e.g. single-sheet upload)
  const sourceXml = feeTemplatesXml ?? xml;

  const rowPattern = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
  const cellPattern = /<Cell[^>]*>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/gi;

  const allRows: string[][] = [];
  let rowMatch;
  while ((rowMatch = rowPattern.exec(sourceXml)) !== null) {
    const cells: string[] = [];
    let cellMatch;
    const cellRe = new RegExp(cellPattern.source, "gi");
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(decode(cellMatch[1]));
    }
    if (cells.length > 0) allRows.push(cells);
  }
  return parseFeesRows(allRows);
}

function parseFeesYaml(text: string): FeeRecord[] | string {
  const blocks = text.split(/\n  - object: LLC_BI__Template_Records__c/);
  blocks.shift();
  const parsed: FeeRecord[] = [];
  for (const block of blocks) {
    const gF = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*"([^"]*)"`, "i"));
      return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "";
    };
    const gN = (label: string) => {
      const m = block.match(new RegExp(`${label}:\\s*([\\d.]+)`, "i"));
      return m ? parseFloat(m[1]) : undefined;
    };
    const name = gF("LLC_BI__Picklist_1__c");
    if (!name) continue;
    const calcTypeRaw = gF("LLC_BI__Picklist_4__c");
    const calculationType =
      calcTypeRaw === "Flat Amount" || calcTypeRaw === "Percentage" ? calcTypeRaw : undefined;
    parsed.push({
      name,
      feePaidBy: gF("LLC_BI__Picklist_2__c") || undefined,
      calculationType,
      basisSource: calculationType === "Percentage" ? gF("LLC_BI__Basis_Source__c") || undefined : undefined,
      percentage: calculationType === "Percentage" ? gN("LLC_BI__Percentage__c") : undefined,
      amount: calculationType === "Flat Amount" ? gN("LLC_BI__Currency_Field_1__c") : undefined,
      collectionMethod: gF("LLC_BI__Collection_Method__c") || undefined,
    });
  }
  if (!parsed.length) return "No LLC_BI__Template_Records__c fee records found.";
  return parsed;
}

export function parseFeesFile(text: string, filename: string): FeeRecord[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
    return parseFeesYaml(raw);
  }
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<Workbook")) {
    return parseFeesSpreadsheetML(raw);
  }
  // Plain CSV
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return parseFeesRows(lines.map(parseCsvRow));
}

// Legacy — kept so old callers don't break; remove once confirmed unused
export function _parseDocmanExcelLegacy(text: string): DocmanExport | string {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty.";

  const headers = parseCsvRow(lines[0]).map((h) => h.trim());
  const nameIdx = headers.findIndex((h) => h === "Name");
  const levelIdx = headers.findIndex((h) => h === "Level");
  const defaultIdx = headers.findIndex((h) => h === "Is Default");

  if (nameIdx === -1 || levelIdx === -1) {
    return 'Could not find "Name" and "Level" columns. Export the YAML file for re-importing.';
  }

  const placeholders: DocmanPlaceholderRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const name = (cells[nameIdx] ?? "").trim();
    const level = (cells[levelIdx] ?? "").trim() as DocmanLevel;
    if (!name || !DOCMAN_LEVELS.includes(level)) continue;
    const isDefault = defaultIdx !== -1 && (cells[defaultIdx] ?? "").trim().toLowerCase() === "true";
    placeholders.push({ name, level, isDefault: isDefault || undefined });
  }

  if (!placeholders.length) return "No placeholder rows found.";
  return { placeholders, groups: [] };
}

// ── Stages ────────────────────────────────────────────────────────────────────

export type StageImportRow = {
  stageName: string;
  sectionName: string;
  isDefault?: boolean;
  isHidden?: boolean;
  description?: string;
  subsections?: { id: string; name: string; fields: { id: string; name: string; fieldType: string }[] }[];
};

type StageExportData = {
  stages: {
    name: string;
    isFixed?: boolean;
    enabledTabs?: string[];
    sections: {
      name: string;
      isDefault?: boolean;
      isHidden?: boolean;
      description?: string;
      subsections?: { id: string; name: string; fields: { id: string; name: string; fieldType: string }[] }[];
    }[];
  }[];
};

export function buildStagesYaml(
  data: StageExportData,
  meta: { storyId: string; title: string; featureArea: string },
): string {
  const lines: string[] = [];
  lines.push(`# ${meta.storyId} — ${meta.title}`);
  lines.push(`# Feature area: ${meta.featureArea}`);
  lines.push(`# Generated: ${today()}`);
  lines.push("");
  lines.push("stages:");
  for (const stage of data.stages) {
    lines.push(`  - name: "${yamlStr(stage.name)}"`);
    if (stage.isFixed) lines.push(`    isFixed: true`);
    if (stage.enabledTabs) lines.push(`    enabledTabs: [${stage.enabledTabs.map((t) => `"${yamlStr(t)}"`).join(", ")}]`);
    lines.push(`    routes:`);
    for (const sec of stage.sections) {
      lines.push(`      - name: "${yamlStr(sec.name)}"`);
      lines.push(`        isUserCreated: ${!sec.isDefault}`);
      if (sec.isHidden) lines.push(`        isHidden: true`);
      if (sec.description) lines.push(`        description: "${yamlStr(sec.description)}"`);
      if (sec.subsections && sec.subsections.length > 0) {
        lines.push(`        subRoutes:`);
        for (const sub of sec.subsections) {
          lines.push(`          - name: "${yamlStr(sub.name)}"`);
          if (sub.fields.length > 0) {
            lines.push(`            fields:`);
            for (const f of sub.fields) {
              lines.push(`              - name: "${yamlStr(f.name)}"`);
              lines.push(`                fieldType: "${yamlStr(f.fieldType)}"`);
            }
          }
        }
      }
    }
  }
  return lines.join("\n");
}

export function downloadStagesYaml(
  data: StageExportData,
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildStagesYaml(data, meta);
  downloadBlob(new Blob([yaml], { type: "text/yaml" }), `stages-${slugify(meta.title || "export")}.yaml`);
}

export function downloadStagesExcel(data: StageExportData) {
  const allRows: string[][] = [];
  const COLS = ["Stage", "Route", "Is User Created", "Is Hidden", "Description", "Sub Route", "Field Name", "Field Type"];

  for (const stage of data.stages) {
    for (const sec of stage.sections) {
      const userCreated = !sec.isDefault ? "true" : "false";
      if (!sec.subsections || sec.subsections.length === 0) {
        allRows.push([stage.name, sec.name, userCreated, sec.isHidden ? "true" : "", sec.description ?? "", "", "", ""]);
      } else {
        for (const sub of sec.subsections) {
          if (sub.fields.length === 0) {
            allRows.push([stage.name, sec.name, userCreated, sec.isHidden ? "true" : "", sec.description ?? "", sub.name, "", ""]);
          } else {
            for (const f of sub.fields) {
              allRows.push([stage.name, sec.name, userCreated, sec.isHidden ? "true" : "", sec.description ?? "", sub.name, f.name, f.fieldType]);
            }
          }
        }
      }
    }
  }

  // Build one worksheet per stage, plus a flat "All Stages" sheet
  let sheetsXml = "";

  // All Stages sheet
  const headerRow = `<Row>${COLS.map((c) => `<Cell><Data ss:Type="String">${c}</Data></Cell>`).join("")}</Row>`;
  const dataRows = allRows.map((row) =>
    `<Row>${row.map((c) => `<Cell><Data ss:Type="String">${(c ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Data></Cell>`).join("")}</Row>`
  ).join("\n");
  sheetsXml += `<Worksheet ss:Name="All Stages"><Table>${headerRow}\n${dataRows}</Table></Worksheet>\n`;

  // Per-stage sheets
  for (const stage of data.stages) {
    const sheetName = stage.name.slice(0, 31).replace(/[\\/*?[\]:]/g, "");
    const stageRows = allRows.filter((r) => r[0] === stage.name);
    const stageDataRows = stageRows.map((row) =>
      `<Row>${row.map((c) => `<Cell><Data ss:Type="String">${(c ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Data></Cell>`).join("")}</Row>`
    ).join("\n");
    sheetsXml += `<Worksheet ss:Name="${sheetName}"><Table>${headerRow}\n${stageDataRows}</Table></Worksheet>\n`;
  }

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheetsXml}</Workbook>`;
  downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel" }), "stages-export.xls");
}

export function parseStagesFile(text: string, filename: string): StageImportRow[] | string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return parseStagesYaml(text);
  if (lower.endsWith(".csv")) return parseStagesCsv(text);
  return parseStagesSpreadsheetML(text);
}

function parseStagesYaml(text: string): StageImportRow[] | string {
  try {
    const rows: StageImportRow[] = [];
    let currentStage = "";
    let currentRoute = "";
    let currentRouteObj: StageImportRow | null = null;
    let currentSubRoute: { id: string; name: string; fields: { id: string; name: string; fieldType: string }[] } | null = null;
    const lines = text.split("\n");
    for (const line of lines) {
      const stageMatch = line.match(/^\s{2}-\s+name:\s+"?([^"]+)"?/);
      const routeMatch = line.match(/^\s{6}-\s+name:\s+"?([^"]+)"?/);
      const subRouteMatch = line.match(/^\s{10}-\s+name:\s+"?([^"]+)"?/);
      const fieldMatch = line.match(/^\s{14}-\s+name:\s+"?([^"]+)"?/);
      const fieldTypeMatch = line.match(/^\s{16}fieldType:\s+"?([^"]+)"?/);
      const descMatch = line.match(/^\s{8}description:\s+"?([^"]*)"?/);
      const hiddenMatch = line.match(/^\s{8}isHidden:\s+(true|false)/);
      const isDefaultMatch = line.match(/^\s{8}isDefault:\s+(true|false)/);

      if (stageMatch && !routeMatch) { currentStage = stageMatch[1]; currentRoute = ""; currentRouteObj = null; currentSubRoute = null; }
      else if (routeMatch) {
        if (currentRouteObj) rows.push(currentRouteObj);
        currentRoute = routeMatch[1];
        currentRouteObj = { stageName: currentStage, sectionName: currentRoute };
        currentSubRoute = null;
      } else if (subRouteMatch && currentRouteObj) {
        if (currentSubRoute) currentRouteObj.subsections = [...(currentRouteObj.subsections ?? []), currentSubRoute];
        currentSubRoute = { id: Math.random().toString(36).slice(2), name: subRouteMatch[1], fields: [] };
      } else if (fieldMatch && currentSubRoute) {
        currentSubRoute.fields.push({ id: Math.random().toString(36).slice(2), name: fieldMatch[1], fieldType: "Text" });
      } else if (fieldTypeMatch && currentSubRoute && currentSubRoute.fields.length > 0) {
        currentSubRoute.fields[currentSubRoute.fields.length - 1].fieldType = fieldTypeMatch[1];
      } else if (descMatch && currentRouteObj) {
        currentRouteObj.description = descMatch[1];
      } else if (hiddenMatch && currentRouteObj) {
        currentRouteObj.isHidden = hiddenMatch[1] === "true";
      } else if (isDefaultMatch && currentRouteObj) {
        currentRouteObj.isDefault = isDefaultMatch[1] === "true";
      }
    }
    if (currentSubRoute && currentRouteObj) currentRouteObj.subsections = [...(currentRouteObj.subsections ?? []), currentSubRoute];
    if (currentRouteObj) rows.push(currentRouteObj);
    if (!rows.length) return "No stage routes found in YAML.";
    return rows;
  } catch {
    return "Failed to parse YAML file.";
  }
}

function parseStagesCsv(text: string): StageImportRow[] | string {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return "Empty file.";
  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const stageIdx = headers.indexOf("stage");
  const routeIdx = headers.indexOf("route");
  const descIdx = headers.indexOf("description");
  const hiddenIdx = headers.indexOf("is hidden");
  if (stageIdx === -1 || routeIdx === -1) return "CSV must have 'Stage' and 'Route' columns.";
  const rows: StageImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const stageName = (cells[stageIdx] ?? "").trim();
    const sectionName = (cells[routeIdx] ?? "").trim();
    if (!stageName || !sectionName) continue;
    rows.push({
      stageName,
      sectionName,
      description: descIdx !== -1 ? (cells[descIdx] ?? "").trim() || undefined : undefined,
      isHidden: hiddenIdx !== -1 ? (cells[hiddenIdx] ?? "").trim().toLowerCase() === "true" : undefined,
    });
  }
  if (!rows.length) return "No data rows found.";
  return rows;
}

// ── Connections Builder ───────────────────────────────────────────────────────

export type ConnectionRoleRecord = {
  name: string;
  fromType?: string;
  toType?: string;
  description?: string;
  selfReciprocating?: boolean;
  reciprocalRole?: string;
};

export function buildConnectionsYaml(
  records: ConnectionRoleRecord[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: connections-builder\n  ref: "connections-builder@${today()}"\n\n`;
  y += `# Object: LLC_BI__Connection_Role__c\n# Field: LLC_BI__Role__c (picklist — role name)\n\nrecords:\n\n`;
  if (!records.length) { y += "  # No connection roles configured yet.\n"; return y; }
  for (const r of records) {
    y += `  - object: LLC_BI__Connection_Role__c\n    fields:\n`;
    y += `      LLC_BI__Role__c: "${yamlStr(r.name)}"\n`;
    y += `      Self_Reciprocating__c: ${r.selfReciprocating ? "true" : "false"}\n`;
    if (r.reciprocalRole) y += `      Reciprocal_Role__c: "${yamlStr(r.reciprocalRole)}"\n`;
    y += `\n`;
  }
  return y;
}

export function downloadConnectionsYaml(
  records: ConnectionRoleRecord[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  downloadBlob(
    new Blob([buildConnectionsYaml(records, meta)], { type: "text/yaml" }),
    `${slugify(meta.storyId || "connections")}.yaml`,
  );
}

export function downloadConnectionsExcel(records: ConnectionRoleRecord[]) {
  const rows: unknown[][] = [
    ["Connection Role Name", "Self Reciprocating", "Reciprocal Role"],
    ...records.map((r) => [r.name, r.selfReciprocating ? "true" : "false", r.reciprocalRole ?? ""]),
  ];
  if (records.length === 0) rows.push(["# No connection roles defined", "", ""]);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(rows, "Connection Roles") +
    `</Workbook>`;
  downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }), "connection-roles.xls");
}

export function parseConnectionsFile(text: string, filename: string): ConnectionRoleRecord[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
    const blocks = raw.split(/\n  - object: LLC_BI__Connection_Role__c/);
    blocks.shift();
    const parsed: ConnectionRoleRecord[] = [];
    for (const block of blocks) {
      const gF = (label: string) => {
        const m = block.match(new RegExp(`${label}:\\s*"([^"]*)"`, "i"));
        return m ? m[1] : "";
      };
      const name = gF("LLC_BI__Role__c");
      if (!name) continue;
      parsed.push({
        name,
        fromType: gF("LLC_BI__From_Type__c") || undefined,
        toType: gF("LLC_BI__To_Type__c") || undefined,
      });
    }
    if (!parsed.length) return "No LLC_BI__Relationship__c role records found.";
    return parsed;
  }
  // SpreadsheetML or CSV
  let rowData: string[][] = [];
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<Workbook")) {
    const wsMatch = raw.match(/<Worksheet[^>]*>([\s\S]*?)<\/Worksheet>/);
    const wsText = wsMatch ? wsMatch[1] : raw;
    rowData = [...wsText.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)].map((m) =>
      [...m[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((c) =>
        c[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
      )
    );
  } else {
    rowData = raw.split(/\r?\n/).filter((l) => l.trim()).map(parseCsvRow);
  }
  if (rowData.length < 2) return "File appears empty.";
  const headers = rowData[0].map((h) => h.toLowerCase());
  const nameIdx = headers.findIndex((h) => h.includes("role") || h.includes("name"));
  const fromIdx = headers.findIndex((h) => h.includes("from"));
  const toIdx = headers.findIndex((h) => h.includes("to"));
  const descIdx = headers.findIndex((h) => h.includes("desc"));
  if (nameIdx === -1) return "Could not find a role name column.";
  const parsed: ConnectionRoleRecord[] = [];
  for (let i = 1; i < rowData.length; i++) {
    const cells = rowData[i];
    const name = (cells[nameIdx] ?? "").trim();
    if (!name || name.startsWith("#")) continue;
    parsed.push({
      name,
      fromType: fromIdx !== -1 ? (cells[fromIdx] ?? "").trim() || undefined : undefined,
      toType: toIdx !== -1 ? (cells[toIdx] ?? "").trim() || undefined : undefined,
      description: descIdx !== -1 ? (cells[descIdx] ?? "").trim() || undefined : undefined,
    });
  }
  if (!parsed.length) return "No data rows found.";
  return parsed;
}

// ── Relationships Builder ─────────────────────────────────────────────────────

export type RelationshipRow = { type: string };

export type RelationshipFieldConfig = {
  relationshipType: string;
  sections: { name: string; fields: { name: string; fieldType: string; picklistValues?: string[] }[] }[];
};

export function buildRelationshipsYaml(
  types: string[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: relationships-builder\n  ref: "relationships-builder@${today()}"\n\n`;
  y += `# Object: LLC_BI__Relationship__c\n# Field: LLC_BI__Type__c\n\nrecords:\n\n`;
  for (const type of types) {
    y += `  - object: LLC_BI__Relationship__c\n`;
    y += `    fields:\n`;
    y += `      LLC_BI__Type__c: "${yamlStr(type)}"\n\n`;
  }
  return y;
}

export function downloadRelationshipsYaml(
  types: string[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildRelationshipsYaml(types, meta);
  downloadBlob(new Blob([yaml], { type: "text/yaml" }), `${slugify(meta.storyId || "relationships")}.yaml`);
}

export function downloadRelationshipsExcel(
  types: string[],
  fieldConfigs?: RelationshipFieldConfig[],
  hiddenTypes?: string[],
) {
  const hidden = hiddenTypes ?? [];
  const rows: unknown[][] = [["LLC_BI__Type__c", "Active"]];
  for (const type of types) rows.push([type, hidden.includes(type) ? "false" : "true"]);
  if (rows.length === 1) rows.push(["# No relationship types defined", ""]);

  const typeSheets: string[] = [];
  const usedSheetNames = new Set<string>();

  const uniqueSheetName = (raw: string): string => {
    const base = raw.replace(/[/\\?*[\]:]/g, "-").slice(0, 31);
    if (!usedSheetNames.has(base)) { usedSheetNames.add(base); return base; }
    for (let i = 2; i < 1000; i++) {
      const suffix = ` (${i})`;
      const candidate = base.slice(0, 31 - suffix.length) + suffix;
      if (!usedSheetNames.has(candidate)) { usedSheetNames.add(candidate); return candidate; }
    }
    return base;
  };

  for (const type of types) {
    const config = fieldConfigs?.find((c) => c.relationshipType === type);
    const sheetName = uniqueSheetName(type);
    const sheetRows: unknown[][] = [[`Type: ${type}`], [""]];

    if (!config || config.sections.length === 0) {
      sheetRows.push(["(No field configuration saved for this type)"]);
    } else {
      for (const section of config.sections) {
        sheetRows.push([`[SECTION] ${section.name}`, "", ""]);
        sheetRows.push(["Field Name", "Salesforce Type", "Picklist Values"]);
        if (section.fields.length === 0) {
          sheetRows.push(["(No fields)", "", ""]);
        } else {
          for (const field of section.fields) {
            sheetRows.push([field.name, field.fieldType, (field.picklistValues ?? []).join(", ")]);
          }
        }
        sheetRows.push([""]);
      }
    }
    typeSheets.push(buildXlsxSheet(sheetRows, sheetName));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(rows, "Relationship Types") +
    typeSheets.join("") +
    `</Workbook>`;
  downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }), "relationship-types.xls");
}

export function parseRelationshipsFile(text: string, filename: string): RelationshipRow[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
    const blocks = raw.split(/\n  - object: LLC_BI__Relationship__c/);
    blocks.shift();
    const parsed: RelationshipRow[] = [];
    for (const block of blocks) {
      const m = block.match(/LLC_BI__Type__c:\s*"([^"]*)"/i);
      if (m?.[1]) parsed.push({ type: m[1] });
    }
    if (!parsed.length) return "No LLC_BI__Relationship__c records found.";
    return parsed;
  }
  // CSV or SpreadsheetML
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<Workbook")) {
    const wsMatch = raw.match(/<Worksheet[^>]*ss:Name="Relationship Types"[^>]*>([\s\S]*?)<\/Worksheet>/);
    const wsText = wsMatch ? wsMatch[1] : raw;
    const rowMatches = [...wsText.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)];
    if (rowMatches.length < 2) return "No data rows found.";
    const headers = [...rowMatches[0][1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((m) => m[1].trim().toLowerCase());
    const typeIdx = headers.findIndex((h) => h.includes("type"));
    if (typeIdx === -1) return "Could not find type column.";
    const parsed: RelationshipRow[] = [];
    for (let i = 1; i < rowMatches.length; i++) {
      const cells = [...rowMatches[i][1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((m) => m[1].trim());
      const type = (cells[typeIdx] ?? "").trim();
      if (type && !type.startsWith("#")) parsed.push({ type });
    }
    if (!parsed.length) return "No type rows found.";
    return parsed;
  }
  // Plain CSV
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty.";
  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const typeIdx = headers.findIndex((h) => h.includes("type"));
  if (typeIdx === -1) return "Could not find a type column.";
  const parsed: RelationshipRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const type = (cells[typeIdx] ?? "").trim();
    if (type && !type.startsWith("#")) parsed.push({ type });
  }
  if (!parsed.length) return "No data rows found.";
  return parsed;
}

function parseStagesSpreadsheetML(text: string): StageImportRow[] | string {
  try {
    const wsMatch = text.match(/<Worksheet[^>]*ss:Name="All Stages"[^>]*>([\s\S]*?)<\/Worksheet>/);
    const wsText = wsMatch ? wsMatch[1] : text;
    const rowMatches = [...wsText.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)];
    if (rowMatches.length < 2) return "No data rows found.";
    const getHeader = (row: string) =>
      [...row.matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((m) => m[1].trim().toLowerCase());
    const headers = getHeader(rowMatches[0][1]);
    const stageIdx = headers.indexOf("stage");
    const routeIdx = headers.indexOf("route");
    const descIdx = headers.indexOf("description");
    const hiddenIdx = headers.indexOf("is hidden");
    if (stageIdx === -1 || routeIdx === -1) return "Spreadsheet must have 'Stage' and 'Route' columns.";
    const rows: StageImportRow[] = [];
    for (let i = 1; i < rowMatches.length; i++) {
      const cells = [...rowMatches[i][1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((m) => m[1].trim());
      const stageName = (cells[stageIdx] ?? "").trim();
      const sectionName = (cells[routeIdx] ?? "").trim();
      if (!stageName || !sectionName) continue;
      rows.push({
        stageName,
        sectionName,
        description: descIdx !== -1 ? (cells[descIdx] ?? "").trim() || undefined : undefined,
        isHidden: hiddenIdx !== -1 ? (cells[hiddenIdx] ?? "").trim().toLowerCase() === "true" : undefined,
      });
    }
    if (!rows.length) return "No data rows found.";
    return rows;
  } catch {
    return "Failed to parse spreadsheet.";
  }
}

// ── Entity Involvement Types ──────────────────────────────────────────────────

export type InvolvementTypeRecord = { name: string };

export function buildInvolvementTypesYaml(
  records: InvolvementTypeRecord[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: entity-involvement-builder\n  ref: "entity-involvement-builder@${today()}"\n\n`;
  y += `# Object: LLC_BI__Legal_Entities__c\n# Field: LLC_BI__Borrower_Type__c (picklist)\n\nrecords:\n\n`;
  if (!records.length) { y += "  # No involvement types configured yet.\n"; return y; }
  for (const r of records) {
    y += `  - object: LLC_BI__Legal_Entities__c\n    fields:\n`;
    y += `      LLC_BI__Borrower_Type__c: "${yamlStr(r.name)}"\n\n`;
  }
  return y;
}

export function downloadInvolvementTypesYaml(
  records: InvolvementTypeRecord[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  downloadBlob(
    new Blob([buildInvolvementTypesYaml(records, meta)], { type: "text/yaml" }),
    `${slugify(meta.storyId || "entity-involvement")}.yaml`,
  );
}

export function downloadInvolvementTypesExcel(records: InvolvementTypeRecord[]) {
  const rows: unknown[][] = [
    ["Involvement Type Name"],
    ...records.map((r) => [r.name]),
  ];
  if (records.length === 0) rows.push(["# No involvement types defined"]);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    buildXlsxSheet(rows, "Involvement Types") +
    `</Workbook>`;
  downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }), "entity-involvement-types.xls");
}

export function parseInvolvementTypesFile(text: string, filename: string): InvolvementTypeRecord[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
    const blocks = raw.split(/\n  - object: LLC_BI__Legal_Entities__c/);
    blocks.shift();
    const parsed: InvolvementTypeRecord[] = [];
    for (const block of blocks) {
      const m = block.match(/LLC_BI__Borrower_Type__c:\s*"([^"]*)"/i);
      if (m?.[1]) parsed.push({ name: m[1] });
    }
    if (!parsed.length) return "No LLC_BI__Legal_Entities__c involvement type records found.";
    return parsed;
  }
  let rowData: string[][] = [];
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<Workbook")) {
    const wsMatch = raw.match(/<Worksheet[^>]*>([\s\S]*?)<\/Worksheet>/);
    const wsText = wsMatch ? wsMatch[1] : raw;
    rowData = [...wsText.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)].map((m) =>
      [...m[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((c) =>
        c[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
      )
    );
  } else {
    rowData = raw.split(/\r?\n/).filter((l) => l.trim()).map(parseCsvRow);
  }
  if (rowData.length < 2) return "File appears empty.";
  const headers = rowData[0].map((h) => h.toLowerCase());
  const nameIdx = headers.findIndex((h) => h.includes("involvement") || h.includes("name") || h.includes("type"));
  if (nameIdx === -1) return "Could not find an involvement type column.";
  const parsed: InvolvementTypeRecord[] = [];
  for (let i = 1; i < rowData.length; i++) {
    const name = (rowData[i][nameIdx] ?? "").trim();
    if (name && !name.startsWith("#")) parsed.push({ name });
  }
  if (!parsed.length) return "No data rows found.";
  return parsed;
}
