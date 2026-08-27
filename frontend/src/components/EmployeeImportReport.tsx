import { EmployeeImportIssue } from "../employeeImport";

export function EmployeeImportReport({ issues }: { issues: EmployeeImportIssue[] }) {
  if (!issues.length) return null;
  return <div className="panel import-report">
    <h2>Inconsistências encontradas</h2>
    <p>As linhas válidas podem ser importadas normalmente. Corrija apenas as linhas abaixo e envie-as novamente.</p>
    <div className="import-issue-list">
      {issues.map((issue, index) => <article className="import-issue" key={`${issue.rowNumber}-${issue.field}-${index}`}>
        <strong>Linha {issue.rowNumber} · {issue.field}</strong>
        <span><b>Valor encontrado:</b> {issue.value}</span>
        <span><b>Problema:</b> {issue.message}</span>
        <span><b>Sugestão:</b> {issue.suggestion}</span>
      </article>)}
    </div>
  </div>;
}
