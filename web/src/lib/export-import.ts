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
  financialIndicator?: string;
  description?: string;
};

export function buildCovenantsYaml(
  records: CovenantRecord[],
  meta: { storyId: string; title: string; featureArea: string },
): string {
  const named = records.filter((r) => r.name.trim());
  let y = `story_id: "${meta.storyId}"\ntitle: "${yamlStr(meta.title)}"\nfeature_area: ${meta.featureArea}\n`;
  y += `source:\n  type: covenant-type-builder\n  ref: "covenant-type-builder@${today()}"\n\nrecords:\n\n`;
  if (!named.length) {
    y += "  # No covenant types configured yet.\n";
    return y;
  }
  for (const rec of named) {
    y += `  - object: LLC_BI__Covenant_Type__c\n    fields:\n`;
    y += `      Name: "${yamlStr(rec.name)}"\n`;
    if (rec.category) y += `      LLC_BI__Category__c: "${yamlStr(rec.category)}"\n`;
    if (rec.description) y += `      LLC_BI__Description__c: "${yamlStr(rec.description)}"\n`;
    if (rec.frequency) y += `      LLC_BI__Frequency__c: "${yamlStr(rec.frequency)}"\n`;
    y += `      LLC_BI__Active__c: true\n`;
    y += `\n`;
  }
  return y;
}

export function downloadCovenantsYaml(
  records: CovenantRecord[],
  meta: { storyId: string; title: string; featureArea: string },
) {
  const yaml = buildCovenantsYaml(records, meta);
  downloadBlob(
    new Blob([yaml], { type: "text/yaml" }),
    `${slugify(meta.storyId || "covenants")}.yaml`,
  );
}

const COVENANT_CSV_COLS: { key: keyof CovenantRecord; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "category", label: "LLC_BI__Category__c" },
  { key: "description", label: "LLC_BI__Description__c" },
  { key: "frequency", label: "LLC_BI__Frequency__c" },
  { key: "financialIndicator", label: "Financial_Indicator__c" },
];

export function downloadCovenantsCsv(records: CovenantRecord[]) {
  const named = records.filter((r) => r.name.trim());
  const rows = [COVENANT_CSV_COLS.map((c) => c.label)];
  for (const rec of named) {
    rows.push(COVENANT_CSV_COLS.map((c) => csvCell(rec[c.key] ?? "")));
  }
  const csv = rows.map((r) => r.join(",")).join("\r\n");
  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    "covenant-types.csv",
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
      financialIndicator: get("financialIndicator") || undefined,
    });
  }
  if (!parsed.length) return "No data rows found.";
  return parsed;
}

// ── Smart Checklist ────────────────────────────────────────────────────────────

export type ChecklistRecord = {
  name: string;
  taskType?: string;
  category?: string;
  assignedParty?: string;
  approvalProcess?: string;
  requirementType?: string;
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
  taskType: {
    object: "LLC_BI__Requirement__c",
    field: "Task_Type__c",
    label: "Task Type",
  },
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
    for (const key of ["taskType", "category", "assignedParty", "neededBy"] as const) {
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
  for (const req of named) {
    y += `  - object: LLC_BI__Requirement__c\n    fields:\n`;
    y += `      Name: "${yamlStr(req.name)}"\n`;
    y += `      LLC_BI__Is_Template__c: true\n`;
    if (req.taskType) y += `      Task_Type__c: "${yamlStr(req.taskType)}"\n`;
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
  { key: "taskType", label: "Task_Type__c" },
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

export function downloadChecklistExcel(
  records: ChecklistRecord[],
  userPicklists: Map<string, string[]>,
) {
  const named = records.filter((r) => r.name.trim());
  const reqRows: unknown[][] = [EXCEL_COLS.map((c) => c.label)];
  for (const req of named) {
    reqRows.push(EXCEL_COLS.map((c) => String(req[c.key] ?? "")));
  }
  const sheet1 = buildXlsxSheet(reqRows, "Requirements");

  const customValues = getCustomPicklistValues(named, userPicklists);
  let sheet2 = "";
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
    sheet2 = buildXlsxSheet(customRows, "Custom Picklist Values");
  }

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
      taskType: gF("Task_Type__c") || undefined,
      category: gF("LLC_BI__Category__c") || undefined,
      description: gF("LLC_BI__Description__c") || undefined,
      legalDescription: gF("LLC_BI__Legal_Description__c") || undefined,
      assignedParty: gF("LLC_BI__Assigned_Party__c") || undefined,
      approvalProcess: gF("LLC_BI__Approval_Process__c") || undefined,
      requirementType: gF("LLC_BI__Requirement_Type__c") || undefined,
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
    parsed.push({
      name,
      taskType: get("taskType") || undefined,
      category: get("category") || undefined,
      description: get("description") || undefined,
      legalDescription: get("legalDescription") || undefined,
      assignedParty: get("assignedParty") || undefined,
      approvalProcess: get("approvalProcess") || undefined,
      requirementType: get("requirementType") || undefined,
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
  // Sheet 1: LLC_BI__DocType__c records
  const docTypes = getDocTypes(data.placeholders);
  const dtRows: unknown[][] = [
    ["object", "Name", "LLC_BI__docManager__c (DocManager Type__c value)"],
    ...docTypes.map((dt) => ["LLC_BI__DocType__c", dt.name, LEVEL_TYPE_MAP[dt.level]]),
  ];
  if (!docTypes.length) dtRows.push(["", "# No categories defined", ""]);
  const sheet1 = buildXlsxSheet(dtRows, "DocTypes (Categories)");

  // Sheet 2: LLC_BI__ClosingChecklist__c — Default Templates
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
  const sheet2 = buildXlsxSheet(defRows, "Default Templates");

  // Sheet 3: LLC_BI__ClosingChecklist__c — Conditional Templates
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
  const sheet3 = buildXlsxSheet(condRows, "Conditional Templates");

  // Sheet 4: Level reference
  const refRows: unknown[][] = [
    ["UI Level", "LLC_BI__DocManager__c.LLC_BI__Type__c value"],
    ...DOCMAN_LEVELS.map((l) => [l, LEVEL_TYPE_MAP[l]]),
  ];
  const sheet4 = buildXlsxSheet(refRows, "Level Reference");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    sheet1 + sheet2 + sheet3 + sheet4 +
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
  const criteriaIdx = headers.findIndex((h) => h === "LLC_BI__Criteria__c");
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

    if (!placeholders.find((p) => p.name === name && p.level === level)) {
      placeholders.push({ name, level, category, isDefault: !criteria || undefined });
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
