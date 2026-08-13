import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorMessage, SuccessMessage } from "../components/Feedback";
import { useDemoScope } from "../context/DemoScope";
import { DashboardResponseDemo, IndicatorSummary } from "../mocks/demoTypes";
import { ResultCenter } from "../types";
import { currentCompetency } from "../competencies";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type CenterCode = string;

interface MonthlyRow {
  label: string;
  values: number[];
  total: number;
}

interface FinanceRow {
  month: string;
  faturamento: number;
  custo: number;
  percent: number;
  meta: number;
  metric: number;
  metricLabel: string;
  costPerMetric: number;
}

interface TurnoverRow {
  month: string;
  admissions: number;
  terminations: number;
  employees: number;
  turnover: number;
  average: number;
  meta: number;
}

interface AbsenteeismRow {
  month: string;
  planned: number;
  unproductive: number;
  absenteeism: number;
  average: number;
  meta: number;
}

interface IndicatorSheetData {
  title: string;
  subtitle: string;
  costRows: MonthlyRow[];
  operationalRows: MonthlyRow[];
  financeRows: FinanceRow[];
  turnoverRows: TurnoverRow[];
  absenteeismRows: AbsenteeismRow[];
  financeMetricLabel: string;
  financeMetricUnit: string;
  turnoverMeta: number;
  absenteeismMeta: number;
  costMeta: number;
}

interface IndicatorSheetsResponse {
  year: number;
  centers: ResultCenter[];
  sheets: Record<string, IndicatorSheetData>;
}

function fillMonths(values: number[]) {
  return months.map((_, index) => Number((values[index] ?? 0).toFixed(2)));
}

function monthHeader(value: string) {
  const [year, month] = value.split("-");
  return `${monthName(Number(month))}/${year}`;
}

function buildCompetencies(year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const id = `${year}-${String(month).padStart(2, "0")}`;
    return { id, label: monthHeader(id) };
  });
}

function monthName(month: number) {
  return [
    "",
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ][month] ?? "";
}

function emptySheet(code: string, name: string, year: number): IndicatorSheetData {
  const zeroRows = (labels: string[]) => labels.map(label => ({ label, values: fillMonths([]), total: 0 }));
  return {
    title: `${code || "CR"} ${year}`,
    subtitle: name || "Sem dados",
    costRows: zeroRows(["Salário", "Prolabore", "Dist. Lucro", "Benefício", "Patronal", "FGTS", "Provisão", "Total"]),
    operationalRows: zeroRows(["Efetivo Inicial (Un)", "Afastamentos", "Novas Contratações (Un)", "Desligamentos (Un)", "Horas Programadas", "Horas não Produtivas", "Efetivo Médio", "Efetivo Final"]),
    financeRows: months.map(month => ({ month, faturamento: 0, custo: 0, percent: 0, meta: 0, metric: 0, metricLabel: "Colab", costPerMetric: 0 })),
    turnoverRows: months.map(month => ({ month, admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0, meta: 0 })),
    absenteeismRows: months.map(month => ({ month, planned: 0, unproductive: 0, absenteeism: 0, average: 0, meta: 0 })),
    financeMetricLabel: "Colab",
    financeMetricUnit: "colaboradores",
    turnoverMeta: 0,
    absenteeismMeta: 0,
    costMeta: 0
  };
}

function cloneFinanceRows(rows: FinanceRow[]) {
  return rows.map(row => ({ ...row }));
}

function recalculateFinanceRow(row: FinanceRow) {
  return {
    ...row,
    percent: row.faturamento > 0 ? row.custo / row.faturamento : 0,
    costPerMetric: row.metric > 0 ? row.custo / row.metric : 0
  };
}

function financeScopeKey(companyId: number, year: number, centerCode: string) {
  return `${companyId}:${year}:${centerCode}`;
}

type PresentationTarget = "all" | "cost" | "operational" | "finance" | "turnover" | "absenteeism";

export function IndicatorsPage({ token }: { token: string }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency());
  const [selectedCenter, setSelectedCenter] = useState<CenterCode>("");
  const [dashboard, setDashboard] = useState<DashboardResponseDemo | null>(null);
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [sheets, setSheets] = useState<Record<string, IndicatorSheetData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [presentationTarget, setPresentationTarget] = useState<PresentationTarget | null>(null);
  const [financeEditMode, setFinanceEditMode] = useState(false);
  const [financeDrafts, setFinanceDrafts] = useState<Partial<Record<CenterCode, FinanceRow[]>>>({});
  const [storedRevenue, setStoredRevenue] = useState<Record<string, Record<string, number>>>({});
  const selectedYear = Number(competency.split("-")[0]) || new Date().getFullYear();
  const competencies = useMemo(() => buildCompetencies(selectedYear), [selectedYear]);

  useEffect(() => {
    setFinanceDrafts({});
  }, [competency, selectedCompany.id]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dashboardResponse, indicatorResponse, sheetResponse, revenueResponse] = await Promise.all([
          api<DashboardResponseDemo>(`/dashboard?competency=${competency}`, {}, token),
          api<IndicatorSummary>(`/demo/indicators?competency=${competency}`, {}, token),
          api<IndicatorSheetsResponse>(`/demo/indicators/sheets?competency=${competency}`, {}, token),
          api<Record<string, Record<string, number>>>("/demo/indicator-revenue", {}, token)
        ]);
        if (!active) return;
        const nextCenters = sheetResponse.centers.length
          ? sheetResponse.centers
          : dashboardResponse.cards.map(card => ({ id: card.id, code: card.code, name: card.name, color: card.color, active: true }));
        setDashboard(dashboardResponse);
        setSummary(indicatorResponse);
        setCenters(nextCenters);
        setSheets(sheetResponse.sheets);
        setStoredRevenue(revenueResponse);
        setSelectedCenter(current => {
          if (current && sheetResponse.sheets[current]) return current;
          return nextCenters[0]?.code ?? "";
        });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar indicadores");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [competency, token, selectedCompany.id]);

  const selectedCard = dashboard?.cards.find(card => card.code === selectedCenter) ?? dashboard?.cards[0] ?? null;
  const sheet = useMemo(() => {
    return sheets[selectedCenter] ?? emptySheet(selectedCard?.code ?? selectedCenter, selectedCard?.name ?? selectedCenter, selectedYear);
  }, [selectedCenter, selectedCard, selectedYear, sheets]);
  const selectedMonthIndex = Math.max(0, Math.min(11, Number(competency.split("-")[1]) - 1 || 0));
  const comparativeCards = (dashboard?.cards ?? []).map(card => {
    const cardSheet = sheets[card.code];
    const totalCost = cardSheet?.costRows.find(row => row.label === "Total")?.values[selectedMonthIndex] ?? card.total_cost;
    const absenteeismValue = cardSheet?.absenteeismRows[selectedMonthIndex]?.absenteeism ?? card.absenteeism;
    const turnoverValue = cardSheet?.turnoverRows[selectedMonthIndex]?.turnover ?? card.turnover;
    return { ...card, total_cost: totalCost, absenteeism: absenteeismValue, turnover: turnoverValue };
  });
  const financeRows = financeDrafts[selectedCenter] ?? sheet.financeRows;

  useEffect(() => {
    setFinanceDrafts(previous => {
      if (previous[selectedCenter]) return previous;
      const scope = financeScopeKey(selectedCompany.id, selectedYear, selectedCenter);
      const scopedRevenue = storedRevenue[scope] ?? {};
      const rows = cloneFinanceRows(sheet.financeRows).map(row => recalculateFinanceRow({
        ...row,
        faturamento: scopedRevenue[row.month] ?? row.faturamento
      }));
      return { ...previous, [selectedCenter]: rows };
    });
  }, [selectedCenter, selectedCompany.id, selectedYear, sheet.financeRows, storedRevenue]);

  function updateFinanceRow(month: string, rawValue: number) {
    setFinanceDrafts(previous => {
      const baseRows = previous[selectedCenter] ?? cloneFinanceRows(sheet.financeRows);
      const nextRows = baseRows.map(row => {
        if (row.month !== month) return row;
        return recalculateFinanceRow({ ...row, faturamento: rawValue });
      });
      const scope = financeScopeKey(selectedCompany.id, selectedYear, selectedCenter);
      const values = Object.fromEntries(nextRows.map(row => [row.month, row.faturamento]));
      setStoredRevenue(current => ({ ...current, [scope]: values }));
      void api("/demo/indicator-revenue", {
        method: "PATCH",
        body: JSON.stringify({ scope, values })
      }, token).catch(err => setError(err instanceof Error ? err.message : "Não foi possível salvar o faturamento."));
      return { ...previous, [selectedCenter]: nextRows };
    });
  }

  const financeChartRows = financeRows;

  const summaryCards = summary ? [
    { label: "Efetivo inicial", value: summary.initial_headcount },
    { label: "Admissões", value: summary.admissions },
    { label: "Desligamentos", value: summary.terminations },
    { label: "Efetivo final", value: summary.final_headcount },
    { label: "Efetivo médio", value: summary.average_headcount.toFixed(1) },
    { label: "Absenteísmo", value: percent.format(summary.absenteeism) },
    { label: "Turnover", value: percent.format(summary.turnover) },
    { label: "Custo total", value: money.format(summary.total_cost), strong: true }
  ] : [];

  function renderCostSection(presentation = false) {
    return (
      <section className="panel indicator-sheet indicator-section">
        <div className="indicator-sheet-header">
          <div>
            <span className="eyebrow">Custo Total (+ Provisões)</span>
            <h2>{sheet.title}</h2>
          </div>
          <div className="indicator-header-actions">
            <span className="indicator-chip">{sheet.subtitle}</span>
            {!presentation && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setPresentationTarget("cost")}
                aria-label="Abrir Custo Total (+ Provisões) em modo de exibição"
              >
                ⤢
              </button>
            )}
          </div>
        </div>
        <IndicatorTable
          className="indicator-cost-table"
          title="Custo Total (+ Provisões)"
          monthColumns={months}
          rows={sheet.costRows}
          formatter={value => money.format(value)}
        />
      </section>
    );
  }

  function renderOperationalSection(presentation = false) {
    return (
      <section className="panel indicator-sheet indicator-section">
        <div className="indicator-sheet-header">
          <div>
            <span className="eyebrow">Indicadores operacionais</span>
            <h2>{sheet.title}</h2>
          </div>
          <div className="indicator-header-actions">
            <span className="indicator-chip">Jan a Dez</span>
            {!presentation && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setPresentationTarget("operational")}
                aria-label="Abrir Indicadores operacionais em modo de exibição"
              >
                ⤢
              </button>
            )}
          </div>
        </div>
        <IndicatorTable
          className="indicator-operational-table"
          title="Indicadores operacionais"
          monthColumns={months}
          rows={sheet.operationalRows}
          formatter={value => plainValue(value)}
        />
      </section>
    );
  }

  function renderFinanceSection(presentation = false) {
    const financeHeaders = ["Faturam.", "Custo", "%", "Meta", sheet.financeMetricLabel, `Custo/${sheet.financeMetricLabel.replace(/\s+/g, "")}`];
    return (
      <section className="panel indicator-chart-panel indicator-section">
        <div className="indicator-sheet-header">
          <div>
            <span className="eyebrow">Custo / Faturamento</span>
            <h2>Comparação mensal</h2>
          </div>
          <div className="indicator-header-actions">
            <span className="indicator-chip">{sheet.financeMetricLabel}</span>
            {!presentation && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setPresentationTarget("finance")}
                aria-label="Abrir Custo / Faturamento em modo de exibição"
              >
                ⤢
              </button>
            )}
            {!presentation && (
              <button
                type="button"
                className={`icon-button ${financeEditMode ? "active" : ""}`}
                onClick={() => setFinanceEditMode(value => !value)}
                aria-label="Alternar edição de Custo / Faturamento"
              >
                ✎
              </button>
            )}
          </div>
        </div>
        <div className="indicator-section-note">
          {financeEditMode && !presentation ? "Edição de faturamento ativada. Os custos permanecem vinculados aos fechamentos." : "Dados consolidados por competência e centro de resultado."}
        </div>
        <div className="indicator-topic-stack">
          <div className="indicator-table-shell indicator-finance-table-shell">
            <div className="indicator-table-title">Custo / Faturamento</div>
            <table className="indicator-table indicator-finance-table">
              <thead>
                <tr>
                  <th>Linha</th>
                  {financeHeaders.map(label => <th key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {financeChartRows.map(row => (
                  <tr key={row.month}>
                    <td className="row-label">{row.month}</td>
                    <td>
                      {financeEditMode && !presentation ? (
                        <input
                          className="indicator-inline-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={Number.isFinite(row.faturamento) ? row.faturamento : 0}
                          onChange={event => updateFinanceRow(row.month, Number(event.target.value || 0))}
                        />
                      ) : money.format(row.faturamento)}
                    </td>
                    <td>
                      {money.format(row.custo)}
                    </td>
                    <td>{percent.format(row.percent)}</td>
                    <td>{percent.format(row.meta)}</td>
                    <td>{plainValue(row.metric)}</td>
                    <td>{money.format(row.costPerMetric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ComboChart
            title="Custo / Faturamento"
            labels={financeChartRows.map(row => row.month)}
            barSeries={[
              { label: "Faturam.", values: financeChartRows.map(row => row.faturamento), color: "#1d5d88" },
              { label: "Custo", values: financeChartRows.map(row => row.custo), color: "#ee7b33" }
            ]}
            lineSeries={[
              { label: "%", values: financeChartRows.map(row => row.percent * 100), color: "#2b7a35" },
              { label: "Meta", values: financeChartRows.map(row => row.meta * 100), color: "#17a2c7" }
            ]}
            yFormat={value => formatMoneyCompact(value)}
            rightAxisFormat={value => `${decimal.format(value)}%`}
          />
        </div>
      </section>
    );
  }

  function renderTurnoverSection(presentation = false) {
    return (
      <section className="panel indicator-chart-panel indicator-section">
        <div className="indicator-sheet-header">
          <div>
            <span className="eyebrow">Turnover</span>
            <h2>Rotatividade de pessoal</h2>
          </div>
          <div className="indicator-header-actions">
            <span className="indicator-chip">Meta {percent.format(sheet.turnoverMeta)}</span>
            {!presentation && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setPresentationTarget("turnover")}
                aria-label="Abrir Turnover em modo de exibição"
              >
                ⤢
              </button>
            )}
          </div>
        </div>
        <div className="indicator-topic-stack">
          <IndicatorTable
            className="indicator-turnover-table"
            title="Turnover"
            monthColumns={months}
            rows={sheet.turnoverRows.map(row => ({
              label: row.month,
              values: [row.admissions, row.terminations, row.employees, row.turnover * 100, row.average * 100, row.meta * 100],
              total: row.turnover
            }))}
            formatter={(value, columnIndex) => {
              if (columnIndex < 3) return plainValue(value);
              return `${decimal.format(value)}%`;
            }}
            headerLabels={["Admissões", "Desligamentos", "Colaboradores", "Turnover", "Média", "Meta"]}
            compact
          />
          <ComboChart
            title={`Turnover ${selectedYear}`}
            labels={sheet.turnoverRows.map(row => row.month)}
            barSeries={[
              { label: "Turnover", values: sheet.turnoverRows.map(row => row.turnover * 100), color: "#1d5d88" }
            ]}
            lineSeries={[
              { label: "Média", values: sheet.turnoverRows.map(row => row.average * 100), color: "#ee7b33" },
              { label: "Meta", values: sheet.turnoverRows.map(row => row.meta * 100), color: "#2b7a35" }
            ]}
            yFormat={value => `${decimal.format(value)}%`}
            rightAxisFormat={value => `${decimal.format(value)}%`}
          />
        </div>
      </section>
    );
  }

  function renderAbsenteeismSection(presentation = false) {
    return (
      <section className="panel indicator-chart-panel indicator-section">
        <div className="indicator-sheet-header">
          <div>
            <span className="eyebrow">Absenteísmo</span>
            <h2>Ausências no trabalho</h2>
          </div>
          <div className="indicator-header-actions">
            <span className="indicator-chip">Meta {percent.format(sheet.absenteeismMeta)}</span>
            {!presentation && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setPresentationTarget("absenteeism")}
                aria-label="Abrir Absenteísmo em modo de exibição"
              >
                ⤢
              </button>
            )}
          </div>
        </div>
        <div className="indicator-topic-stack">
          <IndicatorTable
            className="indicator-absenteeism-table"
            title="Absenteísmo"
            monthColumns={months}
            rows={sheet.absenteeismRows.map(row => ({
              label: row.month,
              values: [row.planned, row.unproductive, row.absenteeism * 100, row.average * 100, row.meta * 100],
              total: row.absenteeism
            }))}
            formatter={(value, columnIndex) => {
              if (columnIndex < 2) return plainValue(value);
              return `${decimal.format(value)}%`;
            }}
            headerLabels={["H Program", "H. N. Prod.", "Absenteísmo", "Média", "Meta"]}
            compact
          />
          <ComboChart
            title={`Absenteísmo ${selectedYear}`}
            labels={sheet.absenteeismRows.map(row => row.month)}
            barSeries={[
              { label: "Absenteísmo", values: sheet.absenteeismRows.map(row => row.absenteeism * 100), color: "#1d5d88" }
            ]}
            lineSeries={[
              { label: "Média", values: sheet.absenteeismRows.map(row => row.average * 100), color: "#ee7b33" },
              { label: "Meta", values: sheet.absenteeismRows.map(row => row.meta * 100), color: "#2b7a35" }
            ]}
            yFormat={value => `${decimal.format(value)}%`}
            rightAxisFormat={value => `${decimal.format(value)}%`}
          />
        </div>
      </section>
    );
  }

  return (
    <PageShell title="Indicadores" subtitle={`Leitura da competência por Centro de Resultado na empresa ${selectedCompany.name}.`} error={error}>
      <div className="panel indicator-topbar">
        <div className="indicator-topbar-head">
          <select aria-label="Ano dos indicadores" value={selectedYear} onChange={event => setCompetency(`${event.target.value}-01`)}>
            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <div className="indicator-tabs">
            {competencies.map(item => (
              <button key={item.id} className={competency === item.id ? "active" : ""} onClick={() => setCompetency(item.id)}>{item.label}</button>
            ))}
          </div>
          <button type="button" className="secondary indicator-present-all" onClick={() => setPresentationTarget("all")}>
            Apresentar todos
          </button>
        </div>
        <div className="indicator-tabs center-tabs">
          {centers.map(center => (
            <button key={center.id} className={selectedCenter === center.code ? "active" : ""} onClick={() => setSelectedCenter(center.code)}>{center.code}</button>
          ))}
        </div>
      </div>

      <div className="summary-grid indicators">
        {summaryCards.map(item => <Summary key={item.label} label={item.label} value={item.value} strong={item.strong} />)}
      </div>

      <div className="indicator-center-comparison">
        {comparativeCards.map(card => (
          <article key={card.id} className="center-mini-card" style={{ "--center-color": card.color } as CSSProperties}>
            <span>{card.code}</span>
            <strong>{card.name}</strong>
            <small>{card.active_employees} ativos</small>
            <small>{money.format(card.total_cost)}</small>
            <small>Abs {percent.format(card.absenteeism)} | Turn {percent.format(card.turnover)}</small>
          </article>
        ))}
      </div>

      <div className="indicator-stack">
        {renderCostSection()}
        {renderOperationalSection()}
        {renderFinanceSection()}
        {renderTurnoverSection()}
        {renderAbsenteeismSection()}
      </div>

      {presentationTarget && (
        <div className="presentation-modal" role="dialog" aria-modal="true" onClick={() => setPresentationTarget(null)}>
          <div className="presentation-modal-panel" onClick={event => event.stopPropagation()}>
            <div className="presentation-modal-header">
              <div>
                <span className="eyebrow">Modo de exibição</span>
                <h2>
                  {presentationTarget === "all"
                    ? "Todos os indicadores"
                    : presentationTarget === "cost"
                      ? "Custo Total (+ Provisões)"
                      : presentationTarget === "operational"
                        ? "Indicadores operacionais"
                        : presentationTarget === "finance"
                          ? "Custo / Faturamento"
                          : presentationTarget === "turnover"
                            ? "Turnover"
                            : "Absenteísmo"}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setPresentationTarget(null)} aria-label="Fechar apresentação">
                ✕
              </button>
            </div>
            <div className="presentation-modal-body">
              {presentationTarget === "all" ? (
                <div className="presentation-stack">
                  {renderCostSection(true)}
                  {renderOperationalSection(true)}
                  {renderFinanceSection(true)}
                  {renderTurnoverSection(true)}
                  {renderAbsenteeismSection(true)}
                </div>
              ) : (
                <div className="presentation-stack">
                  {presentationTarget === "cost" && renderCostSection(true)}
                  {presentationTarget === "operational" && renderOperationalSection(true)}
                  {presentationTarget === "finance" && renderFinanceSection(true)}
                  {presentationTarget === "turnover" && renderTurnoverSection(true)}
                  {presentationTarget === "absenteeism" && renderAbsenteeismSection(true)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ title, subtitle, error = "", success = "", children }: { title: string; subtitle: string; error?: string; success?: string; children: ReactNode }) {
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Gestão</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <ErrorMessage message={error} />
      <SuccessMessage message={success} />
      {children}
    </>
  );
}

function Summary({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function IndicatorTable({
  title,
  monthColumns,
  rows,
  formatter,
  headerLabels,
  compact = false,
  className = ""
}: {
  title: string;
  monthColumns: string[];
  rows: MonthlyRow[] | { label: string; values: number[]; total: number }[];
  formatter: (value: number, columnIndex: number) => string;
  headerLabels?: string[];
  compact?: boolean;
  className?: string;
}) {
  const columns = headerLabels ?? [];
  return (
    <div className={`indicator-table-shell ${compact ? "compact" : ""} ${className}`.trim()}>
      <div className="indicator-table-title">{title}</div>
      <table className="indicator-table">
        <thead>
          <tr>
            <th>Linha</th>
            {columns.length ? columns.map((label, index) => <th key={index}>{label}</th>) : monthColumns.map(month => <th key={month}>{month}</th>)}
            {!columns.length && <th>Total</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td className="row-label">{row.label}</td>
              {row.values.map((value, index) => <td key={`${row.label}-${index}`}>{formatter(value, index)}</td>)}
              {!columns.length && <td className="total-cell">{formatter(row.total, row.values.length)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComboChart({
  title,
  labels,
  barSeries,
  lineSeries,
  yFormat,
  rightAxisFormat
}: {
  title: string;
  labels: string[];
  barSeries: { label: string; values: number[]; color: string }[];
  lineSeries: { label: string; values: number[]; color: string }[];
  yFormat: (value: number) => string;
  rightAxisFormat?: (value: number) => string;
}) {
  const width = 1260;
  const height = 448;
  const padding = { top: 32, right: 66, bottom: 58, left: 68 };
  const xScale = 1;
  const availableWidth = width - padding.left - padding.right;
  const chartWidth = availableWidth * xScale;
  const chartLeft = padding.left + (availableWidth - chartWidth) / 2;
  const chartRight = chartLeft + chartWidth;
  const barMax = Math.max(...barSeries.flatMap(series => series.values), 1);
  const lineMax = Math.max(...lineSeries.flatMap(series => series.values), 1);
  const scaleBarY = (value: number) => height - padding.bottom - (value / barMax) * (height - padding.top - padding.bottom);
  const scaleLineY = (value: number) => height - padding.bottom - (value / lineMax) * (height - padding.top - padding.bottom);
  const chartHeight = height - padding.top - padding.bottom;
  const bandWidth = chartWidth / labels.length;
  const barWidth = Math.min(18, bandWidth / (barSeries.length + 1));

  return (
    <div className="indicator-chart-card">
      <div className="indicator-table-title">{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="indicator-chart" role="img" aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction, index) => {
          const y = padding.top + chartHeight * fraction;
          const value = barMax * (1 - fraction);
          const rightValue = lineMax * (1 - fraction);
          return (
            <g key={index}>
              <line x1={chartLeft} x2={chartRight} y1={y} y2={y} className="chart-grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-axis-text">{yFormat(value)}</text>
              {rightAxisFormat && <text x={chartRight + 8} y={y + 4} className="chart-axis-text">{rightAxisFormat(rightValue)}</text>}
            </g>
          );
        })}

        {barSeries.map((series, seriesIndex) => (
          <g key={series.label}>
            {series.values.map((value, index) => {
              const x = chartLeft + index * bandWidth + (seriesIndex + 0.5) * barWidth;
              const y = scaleBarY(value);
              return <rect key={`${series.label}-${index}`} x={x} y={y} width={barWidth} height={height - padding.bottom - y} fill={series.color} rx="2" />;
            })}
          </g>
        ))}

        {lineSeries.map(series => {
          const points = series.values.map((value, index) => `${chartLeft + index * bandWidth + bandWidth / 2},${scaleLineY(value)}`).join(" ");
          return (
            <g key={series.label}>
              <polyline points={points} fill="none" stroke={series.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {series.values.map((value, index) => (
                <circle key={`${series.label}-${index}`} cx={chartLeft + index * bandWidth + bandWidth / 2} cy={scaleLineY(value)} r="3.5" fill={series.color} />
              ))}
            </g>
          );
        })}

        {labels.map((label, index) => (
          <text key={label} x={chartLeft + index * bandWidth + bandWidth / 2} y={height - 12} textAnchor="middle" className="chart-axis-text">{label}</text>
        ))}
      </svg>
      <div className="chart-legend">
        {barSeries.map(series => <span key={series.label}><i style={{ background: series.color }} />{series.label}</span>)}
        {lineSeries.map(series => <span key={series.label}><i style={{ background: series.color }} />{series.label}</span>)}
      </div>
    </div>
  );
}

function formatMoneyCompact(value: number) {
  if (value >= 1000000) return `${decimal.format(value / 1000000)} mi`;
  if (value >= 1000) return `${decimal.format(value / 1000)} mil`;
  return money.format(value);
}

function plainValue(value: number) {
  return decimal.format(value);
}
