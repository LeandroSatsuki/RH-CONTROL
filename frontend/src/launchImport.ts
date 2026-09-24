export type LaunchImportEmployee = { employment_id: number; employee_code: string; employee_name: string; amount: number; note: string };
export type LaunchImportPreview = { items: { employment_id: number; employee_name: string; amount: number; note: string }[]; issues: string[] };
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export function previewLaunchImport(rows: Record<string, unknown>[], employees: LaunchImportEmployee[], competency: string, kind: string): LaunchImportPreview {
  const result: LaunchImportPreview = { items: [], issues: [] };
  const normalizedRows = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value])));
  const seen = new Map<string, number>();
  normalizedRows.forEach(row => { const code = normalize(row.MATRICULA); seen.set(code, (seen.get(code) ?? 0) + 1); });
  normalizedRows.forEach((row, index) => {
    const issue = (message: string) => result.issues.push(`Linha ${index + 2}: ${message}`);
    const code = normalize(row.MATRICULA);
    const candidates = employees.filter(employee => normalize(employee.employee_code) === code);
    if (!code || candidates.length !== 1) return issue("Matrícula ausente, ambígua ou não elegível. Use o modelo deste lançamento.");
    if ((seen.get(code) ?? 0) > 1) return issue(`Matrícula ${code} repetida; mantenha apenas uma linha.`);
    if (String(row.COMPETENCIA ?? "") !== competency || normalize(row.TIPO) !== kind) return issue("Competência ou tipo diferentes do lançamento aberto.");
    let raw = row.VALOR;
    if (typeof raw === "string") {
      const text = raw.trim().replace(/^R\$\s*/, "");
      raw = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
    }
    if (raw === "" || raw == null) return;
    const amount = Number(raw);
    if ((typeof raw !== "string" && typeof raw !== "number") || !Number.isFinite(amount) || amount < 0 || amount > 1e9 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) return issue("Informe valor positivo ou zero, com no máximo duas casas decimais.");
    result.items.push({ employment_id: candidates[0].employment_id, employee_name: candidates[0].employee_name, amount, note: String(row.OBSERVACAO ?? "").slice(0, 240) });
  });
  return result;
}
