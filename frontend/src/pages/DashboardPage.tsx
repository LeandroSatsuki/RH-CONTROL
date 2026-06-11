import { useEffect, useState } from "react";
import { IS_DEMO_MODE, api } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage } from "../components/Feedback";
import { DashboardResponseDemo } from "../mocks/demoTypes";
import { DashboardCard } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export function DashboardPage({ token }: { token: string }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState("2026-06");
  const [data, setData] = useState<DashboardResponseDemo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      try {
        const response = await api<DashboardResponseDemo>(`/dashboard?competency=${competency}`, {}, token);
        if (active) setData(response);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar dashboard");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => {
      active = false;
    };
  }, [competency, token, selectedCompany.id]);

  const consolidated = data?.consolidated;

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Visão geral</span>
          <h1>Dashboard</h1>
          <p>Acompanhe pessoas, custos e riscos por Centro de Resultado na empresa selecionada.</p>
        </div>
        <div className="filters">
          <select value={competency} onChange={event => setCompetency(event.target.value)}>
            {["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map(item => <option key={item} value={item}>{labelCompetency(item)}</option>)}
          </select>
        </div>
      </div>

      <ErrorMessage message={error} />
      {loading && <div className="inline-loading">Carregando dashboard...</div>}
      {!error && data && <p className="note">Empresa ativa: <strong>{data.company?.name ?? "Todas as empresas"}</strong> • {(data.company as { group?: string; group_name?: string } | null)?.group ?? (data.company as { group_name?: string } | null)?.group_name ?? "Visão consolidada"}</p>}

      {consolidated && (
        <section className="summary-grid">
          <Summary label="Efetivo ativo" value={String(consolidated.active_employees)} />
          <Summary label="Custo bruto" value={money.format(consolidated.gross_payroll)} />
          <Summary label="Custo líquido" value={money.format(consolidated.net_payroll)} />
          <Summary label="Custo total" value={money.format(consolidated.total_cost)} strong />
          <Summary label="Absenteísmo" value={percent.format(consolidated.absenteeism)} />
          <Summary label="Turnover" value={percent.format(consolidated.turnover)} />
        </section>
      )}

      <div className="dashboard-grid">
        {data?.cards.map(card => <CenterCard key={card.id} card={card} />)}
      </div>
      {!data?.cards.length && !error && !loading && <Empty>Nenhum Centro de Resultado ativo.</Empty>}
      <p className="note">{IS_DEMO_MODE ? "No modo demo, os indicadores e valores exibidos são fictícios e servem apenas para apresentação. Os lembretes ficam na aba Alertas." : "Absenteísmo e valores permanecem zerados até os módulos de movimentações e custos serem implementados."}</p>
    </>
  );
}

function CenterCard({ card }: { card: DashboardCard }) {
  const difference = card.active_employees - card.previous_active_employees;
  return (
    <article className="center-card" style={{ "--center-color": card.color } as React.CSSProperties}>
      <div className="center-heading"><div><span>{card.code}</span><h2>{card.name}</h2></div><strong>{card.active_employees}</strong></div>
      <div className="comparison">{difference >= 0 ? "+" : ""}{difference} vs. mês anterior</div>
      <div className="type-tags">{Object.entries(card.by_employment_type).map(([name, count]) => <span key={name}>{name} <strong>{count}</strong></span>)}</div>
      <div className="metrics">
        <Metric label="Admissões" value={String(card.admissions)} important />
        <Metric label="Desligamentos" value={String(card.terminations)} />
        <Metric label="Absenteísmo" value={percent.format(card.absenteeism)} important />
        <Metric label="Turnover" value={percent.format(card.turnover)} important />
        <Metric label="Custo bruto" value={money.format(card.gross_payroll)} important />
        <Metric label="Custo líquido" value={money.format(card.net_payroll)} important />
        <Metric label="Custo total" value={money.format(card.total_cost)} important wide />
      </div>
    </article>
  );
}

function Metric({ label, value, important, wide }: { label: string; value: string; important?: boolean; wide?: boolean }) {
  return <div className={`metric ${important ? "important" : ""} ${wide ? "wide" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function labelCompetency(value: string) {
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
}
