import type { Doc } from "../../convex/_generated/dataModel";
import type { YamlMeta } from "@/components/yaml-export-modal";

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
      xml += `<Cell><Data ss:Type="String">${xlsxEsc(cell)}</Data></Cell>`;
    }
    xml += "</Row>";
  }
  xml += "</Table></Worksheet>";
  return xml;
}

// Salesforce Inspector column headers (relationship format: Field:ObjectAPI:ExternalId)
const LINE_HEADERS = [
  "Name",
  "LLC_BI__Product_Object__c",
];

const TYPE_HEADERS = [
  "Name",
  "LLC_BI__Product_Line__c:LLC_BI__Product_Line__c:Name",
  "LLC_BI__Usage_Type__c",
];

const PRODUCT_HEADERS = [
  "Name",
  "LLC_BI__Product_Line__c:LLC_BI__Product_Line__c:Name",
  "LLC_BI__Product_Type__c:LLC_BI__Product_Type__c:Name",
  "LLC_BI__lookupKey__c",
];

export type ProductHierarchyExport = {
  lines: Doc<"productLines">[];
  types: Doc<"productTypes">[];
  products: Doc<"products">[];
};

function yamlStr(s: string | undefined): string {
  if (!s) return '""';
  if (/[:#\[\]{}&*!|>'"%@`]|^\s|\s$/.test(s) || s.includes("\n")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function buildProductHierarchyYaml(
  data: ProductHierarchyExport,
  meta: YamlMeta,
): string {
  const { lines, types, products } = data;

  const lineRecords = lines.map((l) => {
    let fields = `      Name: ${yamlStr(l.name)}`;
    if (l.productObject) fields += `\n      LLC_BI__Product_Object__c: ${yamlStr(l.productObject)}`;
    return `    - object: LLC_BI__Product_Line__c\n      fields:\n${fields}`;
  });

  const typeRecords = types.map((t) => {
    const line = lines.find((l) => l._id === t.productLineId);
    let fields = `      Name: ${yamlStr(t.name)}`;
    if (line) fields += `\n      LLC_BI__Product_Line__c: ${yamlStr(line.name)}`;
    if (t.usageType) fields += `\n      LLC_BI__Usage_Type__c: ${yamlStr(t.usageType)}`;
    return `    - object: LLC_BI__Product_Type__c\n      fields:\n${fields}`;
  });

  const productRecords = products.map((p) => {
    const type = types.find((t) => t._id === p.productTypeId);
    const line = lines.find((l) => l._id === p.productLineId);
    let fields = `      Name: ${yamlStr(p.name)}`;
    if (type) fields += `\n      LLC_BI__Product_Type__c: ${yamlStr(type.name)}`;
    if (line) fields += `\n      LLC_BI__Product_Line__c: ${yamlStr(line.name)}`;
    if (p.productCode) fields += `\n      LLC_BI__lookupKey__c: ${yamlStr(p.productCode)}`;
    if (p.isLineOfCredit != null)
      fields += `\n      LLC_BI__Line_Of_Credit__c: ${p.isLineOfCredit}`;
    if (p.excludeFromLoanProducts != null)
      fields += `\n      LLC_BI__Exclude_From_LoanProducts__c: ${p.excludeFromLoanProducts}`;
    return `    - object: LLC_BI__Product__c\n      fields:\n${fields}`;
  });

  const allRecords = [...lineRecords, ...typeRecords, ...productRecords].join("\n");

  return `story_id: ${yamlStr(meta.storyId)}
title: ${yamlStr(meta.title)}
feature_area: ${yamlStr(meta.featureArea)}
source: product-hierarchy-builder
records:
${allRecords}
`;
}

type RawRecord = { object: string; fields: Record<string, string> };

function parseRecordBlocks(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  const blockRegex = /^    - object:\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  const positions: { object: string; start: number }[] = [];

  while ((match = blockRegex.exec(text)) !== null) {
    positions.push({ object: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
    const block = text.slice(positions[i].start, end);
    const fields: Record<string, string> = {};
    const fieldRegex = /^      ([^:\n]+?):\s*(.*)$/gm;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRegex.exec(block)) !== null) {
      const key = fm[1].trim();
      const val = fm[2].trim().replace(/^"|"$/g, "");
      fields[key] = val;
    }
    records.push({ object: positions[i].object, fields });
  }

  return records;
}

export function parseProductHierarchyYaml(
  text: string,
): ProductHierarchyExport[] | string {
  try {
    const rawRecords = parseRecordBlocks(text);

    const lineRecords = rawRecords.filter((r) => r.object === "LLC_BI__Product_Line__c");
    const typeRecords = rawRecords.filter((r) => r.object === "LLC_BI__Product_Type__c");
    const productRecords = rawRecords.filter((r) => r.object === "LLC_BI__Product__c");

    if (lineRecords.length === 0) {
      return "No LLC_BI__Product_Line__c records found in YAML.";
    }

    const now = Date.now();
    let idCounter = 1;
    const fakeId = () => `import-${idCounter++}` as unknown as never;

    const lines = lineRecords.map((r) => ({
      _id: fakeId(),
      _creationTime: now,
      projectId: "" as unknown as never,
      name: r.fields["Name"] ?? "",
      productObject: r.fields["LLC_BI__Product_Object__c"] || undefined,
      order: 0,
      createdAt: now,
    }));

    const lineByName = new Map(lines.map((l) => [l.name, l]));

    const types = typeRecords.map((r) => {
      const line = lineByName.get(r.fields["LLC_BI__Product_Line__c"] ?? "");
      return {
        _id: fakeId(),
        _creationTime: now,
        projectId: "" as unknown as never,
        productLineId: line?._id ?? ("" as unknown as never),
        name: r.fields["Name"] ?? "",
        usageType: r.fields["LLC_BI__Usage_Type__c"] || undefined,
        order: 0,
        createdAt: now,
      };
    });

    const typeByName = new Map(types.map((t) => [t.name, t]));

    const products = productRecords.map((r) => {
      const type = typeByName.get(r.fields["LLC_BI__Product_Type__c"] ?? "");
      const line = lineByName.get(r.fields["LLC_BI__Product_Line__c"] ?? "");
      return {
        _id: fakeId(),
        _creationTime: now,
        projectId: "" as unknown as never,
        productTypeId: type?._id ?? ("" as unknown as never),
        productLineId: line?._id ?? ("" as unknown as never),
        name: r.fields["Name"] ?? "",
        productCode: r.fields["LLC_BI__lookupKey__c"] || undefined,
        isLineOfCredit:
          r.fields["LLC_BI__Line_Of_Credit__c"] === "true" ? true : undefined,
        excludeFromLoanProducts:
          r.fields["LLC_BI__Exclude_From_LoanProducts__c"] === "true" ? true : undefined,
        order: 0,
        createdAt: now,
      };
    });

    return [{ lines, types, products }];
  } catch (err) {
    return `Parse error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Excel export / import ─────────────────────────────────────────────────────

export function downloadProductHierarchyExcel(data: ProductHierarchyExport) {
  const { lines, types, products } = data;

  // Sheet 1 — LLC_BI__Product_Line__c
  // lookupKey convention: PL-{Name}
  const lineRows: string[][] = [LINE_HEADERS];
  for (const l of lines) {
    lineRows.push([
      l.name,
      l.productObject ?? "LLC_BI__Loan__c",
    ]);
  }

  // Sheet 2 — LLC_BI__Product_Type__c
  const typeRows: string[][] = [TYPE_HEADERS];
  for (const t of types) {
    const line = lines.find((l) => l._id === t.productLineId);
    typeRows.push([
      t.name,
      line?.name ?? "",
      t.usageType ?? "",
    ]);
  }

  // Sheet 3 — LLC_BI__Product__c
  const productRows: string[][] = [PRODUCT_HEADERS];
  for (const p of products) {
    const type = types.find((t) => t._id === p.productTypeId);
    const line = lines.find((l) => l._id === p.productLineId);
    productRows.push([
      p.name,
      line?.name ?? "",
      type?.name ?? "",
      p.productCode ?? "",
    ]);
  }

  // Sheet 4 — Picklist Changes
  const PICKLIST_HEADERS = [
    "Object Label",
    "Object API Name",
    "Field Label",
    "Field API Name",
    "Picklist Value to Add",
    "Notes",
  ];

  const PICKLIST_OBJECTS = [
    { label: "Loan", api: "LLC_BI__Loan__c" },
    { label: "Opportunity", api: "Opportunity" },
    { label: "Lead", api: "Lead" },
  ];

  const PICKLIST_FIELDS: { label: string; api: string; values: string[] }[] = [
    {
      label: "Product Line",
      api: "LLC_BI__Product_Line__c",
      values: [...new Set(lines.map((l) => l.name))],
    },
    {
      label: "Product Type",
      api: "LLC_BI__Product_Type__c",
      values: [...new Set(types.map((t) => t.name))],
    },
    {
      label: "Product",
      api: "LLC_BI__Product__c",
      values: [...new Set(products.map((p) => p.name))],
    },
  ];

  const picklistRows: string[][] = [PICKLIST_HEADERS];
  for (const field of PICKLIST_FIELDS) {
    for (const value of field.values) {
      for (const obj of PICKLIST_OBJECTS) {
        picklistRows.push([
          obj.label,
          obj.api,
          field.label,
          field.api,
          value,
          "Add value to field; add to all relevant Record Types; configure field dependency (Product Line → Product Type → Product)",
        ]);
      }
    }
  }

  // Sheet 5 — Instructions
  const instrRows: string[][] = [
    ["nCino Product Hierarchy — Salesforce Inspector Import Guide"],
    [""],
    ["TOOL", "Import each sheet using Salesforce Inspector Chrome extension > Import Data"],
    ["LOAD ORDER", "MUST load in this order: 1. Product Lines  →  2. Product Types  →  3. Products"],
    ["ACTION", "Use 'Insert' for new records. Use 'Upsert' with LLC_BI__lookupKey__c as External ID on LLC_BI__Product__c to avoid duplicates on re-run."],
    [""],
    ["SHEET: 1 - Product Lines  (Object: LLC_BI__Product_Line__c)"],
    ["  Name", "REQUIRED. Product line name. Must EXACTLY match the picklist API value on LLC_BI__Loan__c."],
    ["  LLC_BI__Product_Object__c", "Salesforce object this line applies to. Typical values: LLC_BI__Loan__c, LLC_BI__Deposit__c, LLC_BI__Treasury_Service__c"],
    [""],
    ["SHEET: 2 - Product Types  (Object: LLC_BI__Product_Type__c)"],
    ["  Name", "REQUIRED. Product type name. Must EXACTLY match the picklist API value."],
    ["  LLC_BI__Product_Line__c:LLC_BI__Product_Line__c:Name", "REQUIRED. Parent Product Line — Salesforce Inspector relationship column format. Value = the Product Line Name."],
    ["  LLC_BI__Usage_Type__c", "Usage type picklist. Common values: Loan, Global, Business."],
    [""],
    ["SHEET: 3 - Products  (Object: LLC_BI__Product__c)"],
    ["  Name", "REQUIRED. Product name. Must EXACTLY match the picklist API value. This also forms the Full Product Name concatenation."],
    ["  LLC_BI__Product_Line__c:LLC_BI__Product_Line__c:Name", "REQUIRED. Parent Product Line name."],
    ["  LLC_BI__Product_Type__c:LLC_BI__Product_Type__c:Name", "REQUIRED. Parent Product Type name."],
    ["  LLC_BI__lookupKey__c", "OPTIONAL. Product code for core system integration (e.g. the product code used in the originating core banking system). Used to link nCino products back to core."],
    [""],
    ["POST-LOAD STEPS"],
    ["  1.", "Add picklist values to LLC_BI__Loan__c (and Opportunity, Lead if used) — values must match Name fields exactly."],
    ["  2.", "Configure field dependencies in Salesforce: Product Line → Product Type → Product."],
    ["  3.", "Create a LLC_BI__Product_Feature__c record for each Product (can use the Apex auto-create script from nCino Community)."],
    ["  4.", "Create Product State Config (LLC_BI__Product_State_Config__c) records for each new Product Type."],
    [""],
    ["⚠️  CRITICAL: Picklist API values must EXACTLY match the Name field on each record."],
    ["    Misalignment silently breaks the dependent picklist cascade on the Loan object."],
  ];

  const sheet1 = buildXlsxSheet(lineRows, "1 - Product Lines");
  const sheet2 = buildXlsxSheet(typeRows, "2 - Product Types");
  const sheet3 = buildXlsxSheet(productRows, "3 - Products");
  const sheet4 = buildXlsxSheet(picklistRows, "Picklist Changes");
  const sheet5 = buildXlsxSheet(instrRows, "Instructions");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>` +
    sheet5 + sheet1 + sheet2 + sheet3 + sheet4 +
    `</Workbook>`;

  downloadBlob(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    "product-hierarchy-data-loader.xls",
  );
}

export function parseProductHierarchyExcel(
  text: string,
): ProductHierarchyExport[] | string {
  try {
    // Strip BOM and split rows — SpreadsheetML XML path
    const isXml = text.trimStart().startsWith("<?xml") || text.includes("<Workbook");
    if (isXml) {
      return parseProductHierarchyXml(text);
    }
    // Fallback: treat as CSV
    return parseProductHierarchyCsv(text);
  } catch (err) {
    return `Parse error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function cellsFromRowXml(rowXml: string): string[] {
  return [...rowXml.matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'),
  );
}

function parseProductHierarchyXml(xml: string): ProductHierarchyExport[] | string {
  // Extract worksheets by name
  const worksheetRegex = /<Worksheet[^>]*ss:Name="([^"]*)"[^>]*>([\s\S]*?)<\/Worksheet>/gi;
  const sheets = new Map<string, string[][]>();

  let ws: RegExpExecArray | null;
  while ((ws = worksheetRegex.exec(xml)) !== null) {
    const sheetName = ws[1];
    const sheetXml = ws[2];
    const rowMatches = [...sheetXml.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/gi)];
    sheets.set(sheetName, rowMatches.map((r) => cellsFromRowXml(r[1])));
  }

  // Try 3-sheet format first (new format)
  const lineSheet = sheets.get("1 - Product Lines");
  const typeSheet = sheets.get("2 - Product Types");
  const productSheet = sheets.get("3 - Products");

  if (lineSheet && typeSheet && productSheet) {
    return parseThreeSheetFormat(lineSheet, typeSheet, productSheet);
  }

  // Fallback: single-sheet flat format (old format) — use first non-Instructions sheet
  for (const [name, rows] of sheets.entries()) {
    if (name === "Instructions") continue;
    if (rows.length < 2) continue;
    return buildExportFromRows(rows.slice(1)); // skip header row
  }

  return "No recognisable product hierarchy data found in Excel file.";
}

function parseThreeSheetFormat(
  lineRows: string[][],
  typeRows: string[][],
  productRows: string[][],
): ProductHierarchyExport[] | string {
  const now = Date.now();
  let idCounter = 1;
  const fakeId = () => `import-${idCounter++}` as unknown as never;

  // Sheet 1: Name | ProductObject | lookupKey (lookupKey col is export-only, not stored)
  const lineMap = new Map<string, (typeof lines)[number]>();
  const lines: ProductHierarchyExport["lines"] = [];
  for (const row of lineRows.slice(1)) {
    const name = (row[0] ?? "").trim();
    if (!name) continue;
    const id = fakeId();
    const line = {
      _id: id, _creationTime: now, projectId: "" as unknown as never,
      name, productObject: (row[1] ?? "").trim() || undefined,
      order: lines.length, createdAt: now,
    };
    lines.push(line);
    lineMap.set(name, line);
  }

  // Sheet 2: Name | LLC_BI__Product_Line__c:...:Name | UsageType
  const typeMap = new Map<string, (typeof types)[number]>(); // key: "line|||type"
  const types: ProductHierarchyExport["types"] = [];
  for (const row of typeRows.slice(1)) {
    const name = (row[0] ?? "").trim();
    const lineName = (row[1] ?? "").trim();
    if (!name) continue;
    const line = lineMap.get(lineName);
    const id = fakeId();
    const t = {
      _id: id, _creationTime: now, projectId: "" as unknown as never,
      productLineId: line?._id ?? ("" as unknown as never),
      name, usageType: (row[2] ?? "").trim() || undefined,
      order: types.length, createdAt: now,
    };
    types.push(t);
    typeMap.set(`${lineName}|||${name}`, t);
  }

  // Sheet 3: Name | LLC_BI__Product_Line__c:...:Name | LLC_BI__Product_Type__c:...:Name | LLC_BI__lookupKey__c
  const products: ProductHierarchyExport["products"] = [];
  for (const row of productRows.slice(1)) {
    const name = (row[0] ?? "").trim();
    const lineName = (row[1] ?? "").trim();
    const typeName = (row[2] ?? "").trim();
    const productCode = (row[3] ?? "").trim() || undefined;
    if (!name) continue;
    const line = lineMap.get(lineName);
    const t = typeMap.get(`${lineName}|||${typeName}`);
    products.push({
      _id: fakeId(), _creationTime: now, projectId: "" as unknown as never,
      productLineId: line?._id ?? ("" as unknown as never),
      productTypeId: t?._id ?? ("" as unknown as never),
      name, productCode, order: products.length, createdAt: now,
    });
  }

  if (lines.length === 0) return "No product lines found in Excel file.";
  return [{ lines, types, products }];
}

function parseProductHierarchyCsv(text: string): ProductHierarchyExport[] | string {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return "File appears empty or has no data rows.";

  function parseCsvRow(line: string): string[] {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  const dataRows = lines.slice(1).map(parseCsvRow);
  return buildExportFromRows(dataRows);
}

function buildExportFromRows(dataRows: string[][]): ProductHierarchyExport[] | string {
  // Columns: 0=ProductLine 1=ProductType 2=Product 3=FullName 4=ProductObject 5=UsageType 6=LookupKey 7=LOC 8=Exclude
  const now = Date.now();
  let idCounter = 1;
  const fakeId = () => `import-${idCounter++}` as unknown as never;

  const lineMap = new Map<string, ReturnType<typeof fakeId>>();
  const typeMap = new Map<string, ReturnType<typeof fakeId>>(); // key: "lineName|||typeName"

  const lines: ProductHierarchyExport["lines"] = [];
  const types: ProductHierarchyExport["types"] = [];
  const products: ProductHierarchyExport["products"] = [];

  for (const row of dataRows) {
    const lineName = (row[0] ?? "").trim();
    const typeName = (row[1] ?? "").trim();
    const productName = (row[2] ?? "").trim();
    if (!lineName && !productName) continue;

    // Ensure line exists
    if (lineName && !lineMap.has(lineName)) {
      const id = fakeId();
      lineMap.set(lineName, id);
      lines.push({
        _id: id,
        _creationTime: now,
        projectId: "" as unknown as never,
        name: lineName,
        productObject: (row[4] ?? "").trim() || undefined,
        order: lines.length,
        createdAt: now,
      });
    }

    // Ensure type exists
    const typeKey = `${lineName}|||${typeName}`;
    if (typeName && !typeMap.has(typeKey)) {
      const id = fakeId();
      typeMap.set(typeKey, id);
      const lineId = lineMap.get(lineName) ?? ("" as unknown as never);
      types.push({
        _id: id,
        _creationTime: now,
        projectId: "" as unknown as never,
        productLineId: lineId,
        name: typeName,
        usageType: (row[5] ?? "").trim() || undefined,
        order: types.length,
        createdAt: now,
      });
    }

    // Add product
    if (productName) {
      const lineId = lineMap.get(lineName) ?? ("" as unknown as never);
      const typeId = typeMap.get(typeKey) ?? ("" as unknown as never);
      products.push({
        _id: fakeId(),
        _creationTime: now,
        projectId: "" as unknown as never,
        productTypeId: typeId,
        productLineId: lineId,
        name: productName,
        productCode: (row[3] ?? "").trim() || undefined,
        isLineOfCredit: (row[7] ?? "").trim().toLowerCase() === "true" ? true : undefined,
        excludeFromLoanProducts: (row[8] ?? "").trim().toLowerCase() === "true" ? true : undefined,
        order: products.length,
        createdAt: now,
      });
    }
  }

  if (lines.length === 0) return "No product lines found in file.";
  return [{ lines, types, products }];
}
