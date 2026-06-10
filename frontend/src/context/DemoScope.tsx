import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { DemoBackup, DemoClosing, DemoSettings } from "../mocks/demoTypes";
import { CompanyKind } from "../types";

const COMPANY_KEY = "indicadores-selected-company-id";
const ALL_COMPANIES_ID = 0;

export interface ScopedCompany {
  id: number;
  code: string;
  name: string;
  kind: CompanyKind;
  group: string;
  group_name?: string;
  parent_company_id: number | null;
  active: boolean;
  settings?: DemoSettings;
  backups?: DemoBackup[];
  closing?: DemoClosing;
}

const allCompaniesScope: ScopedCompany = {
  id: ALL_COMPANIES_ID,
  code: "TODAS",
  name: "Todas as empresas",
  kind: "OUTRA",
  group: "Todas as empresas",
  parent_company_id: null,
  active: true
};

interface CompanyScopeValue {
  companies: ScopedCompany[];
  selectedCompanyId: number;
  setSelectedCompanyId: (companyId: number) => void;
  selectedCompany: ScopedCompany;
}

const CompanyScopeContext = createContext<CompanyScopeValue | null>(null);

function readStoredCompanyId(fallback: number) {
  const raw = localStorage.getItem(COMPANY_KEY);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CompanyScopeProvider({ companies, children }: { companies: ScopedCompany[]; children: ReactNode }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => readStoredCompanyId(companies[0]?.id ?? 1));

  useEffect(() => {
    if (!companies.length) return;
    const current = selectedCompanyId === ALL_COMPANIES_ID || companies.some(company => company.id === selectedCompanyId)
      ? selectedCompanyId
      : companies[0].id;
    if (current !== selectedCompanyId) {
      setSelectedCompanyId(current);
      return;
    }
    localStorage.setItem(COMPANY_KEY, String(current));
  }, [companies, selectedCompanyId]);

  const value = useMemo<CompanyScopeValue>(() => {
    const selectedCompany = selectedCompanyId === ALL_COMPANIES_ID
      ? allCompaniesScope
      : companies.find(company => company.id === selectedCompanyId) ?? companies[0] ?? allCompaniesScope;
    return {
      companies: [allCompaniesScope, ...companies],
      selectedCompanyId: selectedCompany.id,
      setSelectedCompanyId,
      selectedCompany
    };
  }, [companies, selectedCompanyId]);

  return <CompanyScopeContext.Provider value={value}>{children}</CompanyScopeContext.Provider>;
}

export function useCompanyScope() {
  const context = useContext(CompanyScopeContext);
  if (!context) {
    throw new Error("useCompanyScope deve ser usado dentro de CompanyScopeProvider");
  }
  return context;
}

export const DemoScopeProvider = CompanyScopeProvider;
export const useDemoScope = useCompanyScope;
