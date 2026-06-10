// Translates plain-English criteria into nCino formgen syntax.
// Used by both the Document Manager and Smart Checklist builders.

const FIELD_MAP: Record<string, string> = {
  "product line":    "LLC_BI__Loan__c.LLC_BI__Product_Line__c",
  "product type":    "LLC_BI__Loan__c.LLC_BI__Product_Type__c",
  "product":         "LLC_BI__Loan__c.LLC_BI__Product__c",
  "employee loan":   "LLC_BI__Loan__c.LLC_BI__Employee_Loan__c",
  "loan type":       "LLC_BI__Loan__c.LLC_BI__Loan_Type__c",
  "stage":           "LLC_BI__Loan__c.LLC_BI__Stage__c",
  "loan purpose":    "LLC_BI__Loan__c.LLC_BI__Loan_Purpose__c",
  "collateral type": "LLC_BI__Loan__c.LLC_BI__Collateral_Type__c",
};

function resolveField(raw: string): string {
  return FIELD_MAP[raw.trim().toLowerCase()] ?? `LLC_BI__Loan__c.${raw.trim()}`;
}

export function translateCriteria(english: string): string {
  if (!english.trim()) return "";
  const parts = english.split(/\b(AND|OR)\b/i);
  const conditions: { field: string; value: string; negate: boolean }[] = [];
  const connectors: string[] = [];
  for (const token of parts) {
    const t = token.trim();
    if (/^AND$/i.test(t)) { connectors.push("AND"); continue; }
    if (/^OR$/i.test(t))  { connectors.push("OR");  continue; }
    if (!t) continue;
    const m = t.match(/^(.+?)\s*(?:is(?:\s+not)?|!=|=)\s*(.+)$/i);
    if (!m) continue;
    const negate = /\bis\s+not\b/i.test(t) || t.includes("!=");
    conditions.push({ field: resolveField(m[1]), value: m[2].trim(), negate });
  }
  if (conditions.length === 0) return "";
  let expr = "1";
  for (let i = 1; i < conditions.length; i++) expr += ` ${connectors[i - 1] ?? "AND"} ${i + 1}`;
  const tags = conditions.map((c, i) =>
    `{{COND="${i + 1}" FIELD="${c.field}" IS="${c.value}"${c.negate ? ' NEGATE="True"' : ""}}}`,
  ).join("");
  return `{{IF="${expr}"}}${tags}__GUID__{{ENDIF}}`;
}
