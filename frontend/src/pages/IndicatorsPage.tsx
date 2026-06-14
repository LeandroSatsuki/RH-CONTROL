import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { api, IS_DEMO_MODE } from "../api";
import { ErrorMessage, SuccessMessage } from "../components/Feedback";
import { useDemoScope } from "../context/DemoScope";
import { demoCompetencies, demoResultCenters } from "../mocks/demoData";
import { DashboardResponseDemo, IndicatorSummary } from "../mocks/demoTypes";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type CenterCode = "ADM" | "IND" | "COM" | "DIR";

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

const indicatorSheets: Record<Exclude<CenterCode, "DIR">, IndicatorSheetData> = {
  ADM: {
    title: "ADM 2026",
    subtitle: "Administrativo",
    costRows: [
      { label: "Salário", values: fillMonths([13300, 19300, 20400, 19100]), total: 72100 },
      { label: "Prolabore", values: fillMonths([4863, 4863, 4863, 4863]), total: 19452 },
      { label: "Dist. Lucro", values: fillMonths([27707, 27707, 27707, 27707]), total: 110828 },
      { label: "Benefício", values: fillMonths([8661.88, 11761.88, 12261.88, 11361.88]), total: 44047.52 },
      { label: "Patronal", values: fillMonths([4165.83, 5803.83, 6104.13, 5749.23]), total: 21823.02 },
      { label: "FGTS", values: fillMonths([1064, 1544, 1632, 1528]), total: 5768 },
      { label: "Provisão", values: fillMonths([5678.36, 8240.03, 8709.67, 8154.64]), total: 30782.69 },
      { label: "Total", values: fillMonths([65440.07, 79219.74, 81677.68, 78463.75]), total: 304801.23 }
    ],
    operationalRows: [
      { label: "Efetivo Inicial (Un)", values: fillMonths([3, 4, 6, 6]), total: 19 },
      { label: "Afastamentos", values: fillMonths([13, 12, 0, 9]), total: 34 },
      { label: "Novas Contratações (Un)", values: fillMonths([1, 2, 0, 0]), total: 3 },
      { label: "Desligamentos (Un)", values: fillMonths([0, 0, 0, 1]), total: 1 },
      { label: "Horas Programadas", values: fillMonths([739.2, 1003.2, 1161.6, 880]), total: 3784 },
      { label: "Horas não Produtivas", values: fillMonths([114.4, 105.6, 0, 79.2]), total: 299.2 },
      { label: "Efetivo Médio", values: fillMonths([3.38, 5.37, 6, 4.55]), total: 19.3 },
      { label: "Efetivo Final", values: fillMonths([4, 6, 6, 5]), total: 21 }
    ],
    financeRows: [
      { month: "Jan", faturamento: 1908972, custo: 65440.07, percent: 0.03428026765772945, meta: 0.04, metric: 4, metricLabel: "Colab", costPerMetric: 477243 },
      { month: "Fev", faturamento: 1434145, custo: 79219.74, percent: 0.05523830420060578, meta: 0.04, metric: 6, metricLabel: "Colab", costPerMetric: 239024.17 },
      { month: "Mar", faturamento: 1661970, custo: 81677.68, percent: 0.04914509688301634, meta: 0.04, metric: 6, metricLabel: "Colab", costPerMetric: 276995 },
      { month: "Abr", faturamento: 1747250, custo: 78463.75, percent: 0.044906996073194386, meta: 0.04, metric: 5, metricLabel: "Colab", costPerMetric: 349450 },
      { month: "Mai", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Jun", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Jul", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Ago", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Set", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Out", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Nov", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Dez", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 }
    ],
    turnoverRows: [
      { month: "Jan", admissions: 1, terminations: 0, employees: 4, turnover: 0.125, average: 0.125, meta: 0.15 },
      { month: "Fev", admissions: 2, terminations: 0, employees: 6, turnover: 0.1666666667, average: 0.1458333333, meta: 0.15 },
      { month: "Mar", admissions: 0, terminations: 0, employees: 6, turnover: 0, average: 0.0972222222, meta: 0.15 },
      { month: "Abr", admissions: 0, terminations: 1, employees: 5, turnover: 0.1, average: 0.0979166667, meta: 0.15 },
      { month: "Mai", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0783333333, meta: 0.15 },
      { month: "Jun", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0652777778, meta: 0.15 },
      { month: "Jul", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.055952381, meta: 0.15 },
      { month: "Ago", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0489583333, meta: 0.15 },
      { month: "Set", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0435185185, meta: 0.15 },
      { month: "Out", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0391666667, meta: 0.15 },
      { month: "Nov", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0356060606, meta: 0.15 },
      { month: "Dez", admissions: 0, terminations: 0, employees: 5, turnover: 0, average: 0.0326388889, meta: 0.15 }
    ],
    absenteeismRows: [
      { month: "Jan", planned: 739.2, unproductive: 114.4, absenteeism: 0.1547619048, average: 0.1547619048, meta: 0.15 },
      { month: "Fev", planned: 1003.2, unproductive: 105.6, absenteeism: 0.1052631579, average: 0.1300125313, meta: 0.15 },
      { month: "Mar", planned: 1161.6, unproductive: 0, absenteeism: 0, average: 0.0866750209, meta: 0.15 },
      { month: "Abr", planned: 880, unproductive: 79.2, absenteeism: 0.09, average: 0.0875062657, meta: 0.15 },
      { month: "Mai", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0700050125, meta: 0.15 },
      { month: "Jun", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0583375104, meta: 0.15 },
      { month: "Jul", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0500035804, meta: 0.15 },
      { month: "Ago", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0437531328, meta: 0.15 },
      { month: "Set", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0388916736, meta: 0.15 },
      { month: "Out", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0350025063, meta: 0.15 },
      { month: "Nov", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0318204602, meta: 0.15 },
      { month: "Dez", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0291687552, meta: 0.15 }
    ],
    financeMetricLabel: "Colab",
    financeMetricUnit: "colaboradores",
    turnoverMeta: 0.15,
    absenteeismMeta: 0.15,
    costMeta: 0.04
  },
  IND: {
    title: "IND 2026",
    subtitle: "Industrial",
    costRows: [
      { label: "Salário", values: fillMonths([78662, 73062, 65922, 63822]), total: 281468 },
      { label: "Prolabore", values: fillMonths([3242, 3242, 3242, 3242]), total: 12968 },
      { label: "Dist. Lucro", values: fillMonths([10844, 10844, 10844, 10844]), total: 43376 },
      { label: "Benefício", values: fillMonths([26869.5, 25811.5, 24572.46, 25003.2]), total: 102256.66 },
      { label: "Patronal", values: fillMonths([22445.6, 20712.05, 18694.58, 18394.28]), total: 80246.49 },
      { label: "FGTS", values: fillMonths([6472.96, 5964.96, 5373.76, 5285.76]), total: 23097.44 },
      { label: "Provisão", values: fillMonths([34544.93, 31833.83, 28678.71, 28209.07]), total: 123266.55 },
      { label: "Total", values: fillMonths([183080.98, 171470.34, 157327.51, 154800.31]), total: 666679.14 }
    ],
    operationalRows: [
      { label: "Efetivo Inicial (Un)", values: fillMonths([35, 34, 28, 27]), total: 124 },
      { label: "Afastamentos", values: fillMonths([71, 29, 38, 20]), total: 158 },
      { label: "Novas Contratações (Un)", values: fillMonths([0, 1, 1, 0]), total: 2 },
      { label: "Desligamentos (Un)", values: fillMonths([1, 7, 2, 0]), total: 10 },
      { label: "Horas Programadas", values: fillMonths([6283.2, 4435.2, 5227.2, 4752]), total: 20697.6 },
      { label: "Horas não Produtivas", values: fillMonths([624.8, 255.2, 334.4, 176]), total: 1390.4 },
      { label: "Efetivo Médio", values: fillMonths([30.62, 26.39, 25.27, 26]), total: 108.28 },
      { label: "Efetivo Final", values: fillMonths([34, 28, 27, 27]), total: 116 }
    ],
    financeRows: [
      { month: "Jan", faturamento: 1908972, custo: 183080.98, percent: 0.0959055371, meta: 0.09, metric: 73208, metricLabel: "Prod. KG", costPerMetric: 2.5008330359 },
      { month: "Fev", faturamento: 1434145, custo: 171470.34, percent: 0.1195627622, meta: 0.09, metric: 45010, metricLabel: "Prod. KG", costPerMetric: 3.8096053692 },
      { month: "Mar", faturamento: 1661970, custo: 157327.51, percent: 0.094663266, meta: 0.09, metric: 46908, metricLabel: "Prod. KG", costPerMetric: 3.3539589883 },
      { month: "Abr", faturamento: 1747250, custo: 154800.31, percent: 0.0885965428, meta: 0.09, metric: 45054, metricLabel: "Prod. KG", costPerMetric: 3.4358838135 },
      { month: "Mai", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Jun", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Jul", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Ago", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Set", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Out", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Nov", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 },
      { month: "Dez", faturamento: 0, custo: 0, percent: 0, meta: 0.09, metric: 0, metricLabel: "Prod. KG", costPerMetric: 0 }
    ],
    turnoverRows: [
      { month: "Jan", admissions: 0, terminations: 1, employees: 34, turnover: 0.0147058824, average: 0.0147058824, meta: 0.05 },
      { month: "Fev", admissions: 1, terminations: 7, employees: 28, turnover: 0.1428571429, average: 0.0787815126, meta: 0.05 },
      { month: "Mar", admissions: 1, terminations: 2, employees: 27, turnover: 0.0555555556, average: 0.0710395269, meta: 0.05 },
      { month: "Abr", admissions: 0, terminations: 0, employees: 27, turnover: 0, average: 0.0532796452, meta: 0.05 },
      { month: "Mai", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0425, meta: 0.05 },
      { month: "Jun", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0354, meta: 0.05 },
      { month: "Jul", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0303, meta: 0.05 },
      { month: "Ago", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0265, meta: 0.05 },
      { month: "Set", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0236, meta: 0.05 },
      { month: "Out", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0212, meta: 0.05 },
      { month: "Nov", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0193, meta: 0.05 },
      { month: "Dez", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0179, meta: 0.05 }
    ],
    absenteeismRows: [
      { month: "Jan", planned: 6283.2, unproductive: 624.8, absenteeism: 0.0994397759, average: 0.0994397759, meta: 0.1 },
      { month: "Fev", planned: 4435.2, unproductive: 255.2, absenteeism: 0.0575396825, average: 0.0784897292, meta: 0.1 },
      { month: "Mar", planned: 5227.2, unproductive: 334.4, absenteeism: 0.063973064, average: 0.0736508408, meta: 0.1 },
      { month: "Abr", planned: 4752, unproductive: 176, absenteeism: 0.037037037, average: 0.0644973899, meta: 0.1 },
      { month: "Mai", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0515979119, meta: 0.1 },
      { month: "Jun", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0429982599, meta: 0.1 },
      { month: "Jul", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0368556514, meta: 0.1 },
      { month: "Ago", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0322486949, meta: 0.1 },
      { month: "Set", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0286655066, meta: 0.1 },
      { month: "Out", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0257989559, meta: 0.1 },
      { month: "Nov", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0234535963, meta: 0.1 },
      { month: "Dez", planned: 0, unproductive: 0, absenteeism: 0, average: 0.02149913, meta: 0.1 }
    ],
    financeMetricLabel: "Prod. KG",
    financeMetricUnit: "kg",
    turnoverMeta: 0.05,
    absenteeismMeta: 0.1,
    costMeta: 0.09
  },
  COM: {
    title: "COM 2026",
    subtitle: "Comercial",
    costRows: [
      { label: "Salário", values: fillMonths([412877.04, 364206.41, 362837.99, 350454.84]), total: 1490376.28 },
      { label: "Prêmio", values: fillMonths([96435.3, 12823, 12017, 52761.75]), total: 174037.05 },
      { label: "Transporte", values: fillMonths([32076.48, 58442.55, 64273.15, 33435.79]), total: 188227.97 },
      { label: "Alimentação", values: fillMonths([32260, 31050, 33502, 33802.2]), total: 130614.2 },
      { label: "FGTS", values: fillMonths([8741.31, 11556.61, 12654.16, 9278.79]), total: 42230.86 },
      { label: "Provisão", values: fillMonths([22945.94, 30336.1, 33217.17, 24356.82]), total: 110856.02 },
      { label: "Total", values: fillMonths([605336.06, 508414.67, 518501.47, 504090.18]), total: 2136342.38 }
    ],
    operationalRows: [
      { label: "Efetivo Inicial (Un)", values: fillMonths([62, 60, 66, 63]), total: 251 },
      { label: "Afastamentos", values: fillMonths([63, 47, 128, 189]), total: 427 },
      { label: "Novas Contratações (Un)", values: fillMonths([5, 14, 5, 6]), total: 30 },
      { label: "Desligamentos (Un)", values: fillMonths([7, 8, 8, 5]), total: 28 },
      { label: "Horas Programadas", values: fillMonths([13728, 13939.2, 14414.4, 13516.8]), total: 55598.4 },
      { label: "Horas não Produtivas", values: fillMonths([554.4, 413.6, 1126.4, 1663.2]), total: 3757.6 },
      { label: "Efetivo Médio", values: fillMonths([57.58, 64.04, 58.08, 56.13]), total: 235.83 },
      { label: "Efetivo Final", values: fillMonths([60, 66, 63, 64]), total: 253 }
    ],
    financeRows: [
      { month: "Jan", faturamento: 1908972, custo: 605336.06, percent: 0.3171005465, meta: 0.04, metric: 60, metricLabel: "Colab", costPerMetric: 31816.2 },
      { month: "Fev", faturamento: 1434145, custo: 508414.67, percent: 0.3545071572, meta: 0.04, metric: 66, metricLabel: "Colab", costPerMetric: 21729.47 },
      { month: "Mar", faturamento: 1661970, custo: 518501.47, percent: 0.31198004, meta: 0.04, metric: 63, metricLabel: "Colab", costPerMetric: 26380.48 },
      { month: "Abr", faturamento: 1747250, custo: 504090.18, percent: 0.2885048983, meta: 0.04, metric: 64, metricLabel: "Colab", costPerMetric: 27300.78 },
      { month: "Mai", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Jun", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Jul", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Ago", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Set", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Out", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Nov", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 },
      { month: "Dez", faturamento: 0, custo: 0, percent: 0, meta: 0.04, metric: 0, metricLabel: "Colab", costPerMetric: 0 }
    ],
    turnoverRows: [
      { month: "Jan", admissions: 5, terminations: 7, employees: 60, turnover: 0.1, average: 0.1, meta: 0.15 },
      { month: "Fev", admissions: 14, terminations: 8, employees: 66, turnover: 0.1666666667, average: 0.1333333333, meta: 0.15 },
      { month: "Mar", admissions: 5, terminations: 8, employees: 63, turnover: 0.1031746032, average: 0.1232804233, meta: 0.15 },
      { month: "Abr", admissions: 6, terminations: 5, employees: 64, turnover: 0.0859375, average: 0.1139446925, meta: 0.15 },
      { month: "Mai", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.091155754, meta: 0.15 },
      { month: "Jun", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0759631283, meta: 0.15 },
      { month: "Jul", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0651112528, meta: 0.15 },
      { month: "Ago", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0569723462, meta: 0.15 },
      { month: "Set", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0506420855, meta: 0.15 },
      { month: "Out", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.045577877, meta: 0.15 },
      { month: "Nov", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0414344336, meta: 0.15 },
      { month: "Dez", admissions: 0, terminations: 0, employees: 0, turnover: 0, average: 0.0379815642, meta: 0.15 }
    ],
    absenteeismRows: [
      { month: "Jan", planned: 13728, unproductive: 554.4, absenteeism: 0.0403846154, average: 0.0403846154, meta: 0.15 },
      { month: "Fev", planned: 13939.2, unproductive: 413.6, absenteeism: 0.0296717172, average: 0.0350281663, meta: 0.15 },
      { month: "Mar", planned: 14414.4, unproductive: 1126.4, absenteeism: 0.0781440781, average: 0.0494001369, meta: 0.15 },
      { month: "Abr", planned: 13516.8, unproductive: 1663.2, absenteeism: 0.123046875, average: 0.0678118214, meta: 0.15 },
      { month: "Mai", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0542494571, meta: 0.15 },
      { month: "Jun", planned: 0, unproductive: 0, absenteeism: 0, average: 0.045207881, meta: 0.15 },
      { month: "Jul", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0387496122, meta: 0.15 },
      { month: "Ago", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0339059107, meta: 0.15 },
      { month: "Set", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0301385873, meta: 0.15 },
      { month: "Out", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0271247286, meta: 0.15 },
      { month: "Nov", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0246588442, meta: 0.15 },
      { month: "Dez", planned: 0, unproductive: 0, absenteeism: 0, average: 0.0226039405, meta: 0.15 }
    ],
    financeMetricLabel: "Colab",
    financeMetricUnit: "colaboradores",
    turnoverMeta: 0.15,
    absenteeismMeta: 0.15,
    costMeta: 0.04
  }
};

function fillMonths(values: number[]) {
  return months.map((_, index) => Number((values[index] ?? 0).toFixed(2)));
}

function monthHeader(value: string) {
  const [year, month] = value.split("-");
  return `${monthName(Number(month))}/${year}`;
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

function createDerivedDirSheet(card: NonNullable<DashboardResponseDemo["cards"]>[number] | null): IndicatorSheetData {
  const base = indicatorSheets.IND;
  const factor = card ? Math.max(card.total_cost / 154800.31, 0.35) : 0.75;
  return {
    title: "DIR 2026",
    subtitle: "Diretoria",
    costRows: base.costRows.map(row => ({ ...row, values: row.values.map(value => Number((value * factor).toFixed(2))), total: Number((row.total * factor).toFixed(2)) })),
    operationalRows: base.operationalRows.map(row => ({ ...row, values: row.values.map(value => Number((value * factor).toFixed(2))), total: Number((row.total * factor).toFixed(2)) })),
    financeRows: base.financeRows.map(row => ({ ...row, faturamento: Number((row.faturamento * factor).toFixed(2)), custo: Number((row.custo * factor).toFixed(2)), percent: row.percent, meta: row.meta, metric: Number((row.metric * factor).toFixed(2)), metricLabel: row.metricLabel, costPerMetric: Number((row.costPerMetric * factor).toFixed(2)) })),
    turnoverRows: base.turnoverRows,
    absenteeismRows: base.absenteeismRows,
    financeMetricLabel: base.financeMetricLabel,
    financeMetricUnit: base.financeMetricUnit,
    turnoverMeta: base.turnoverMeta,
    absenteeismMeta: base.absenteeismMeta,
    costMeta: base.costMeta
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

type PresentationTarget = "all" | "cost" | "operational" | "finance" | "turnover" | "absenteeism";

export function IndicatorsPage({ token }: { token: string }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState("2026-06");
  const [selectedCenter, setSelectedCenter] = useState<CenterCode>("IND");
  const [dashboard, setDashboard] = useState<DashboardResponseDemo | null>(null);
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [presentationTarget, setPresentationTarget] = useState<PresentationTarget | null>(null);
  const [financeEditMode, setFinanceEditMode] = useState(false);
  const [financeDrafts, setFinanceDrafts] = useState<Partial<Record<CenterCode, FinanceRow[]>>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dashboardResponse, indicatorResponse] = await Promise.all([
          api<DashboardResponseDemo>(`/dashboard?competency=${competency}`, {}, token),
          api<IndicatorSummary>(`/demo/indicators?competency=${competency}`, {}, token)
        ]);
        if (!active) return;
        setDashboard(dashboardResponse);
        setSummary(indicatorResponse);
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
    if (selectedCenter === "DIR") return createDerivedDirSheet(selectedCard);
    return indicatorSheets[selectedCenter];
  }, [selectedCenter, selectedCard]);
  const comparativeCards = dashboard?.cards ?? [];
  const financeRows = financeDrafts[selectedCenter] ?? sheet.financeRows;

  useEffect(() => {
    setFinanceDrafts(previous => {
      if (previous[selectedCenter]) return previous;
      return { ...previous, [selectedCenter]: cloneFinanceRows(sheet.financeRows) };
    });
  }, [selectedCenter, sheet.financeRows]);

  function updateFinanceRow(month: string, field: "faturamento" | "custo", rawValue: number) {
    setFinanceDrafts(previous => {
      const baseRows = previous[selectedCenter] ?? cloneFinanceRows(sheet.financeRows);
      const nextRows = baseRows.map(row => {
        if (row.month !== month) return row;
        const updated = field === "faturamento" ? { ...row, faturamento: rawValue } : { ...row, custo: rawValue };
        return recalculateFinanceRow(updated);
      });
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
          {financeEditMode && !presentation ? "Edição local de faturamento e custo ativada." : "Dados consolidados por competência e centro de resultado."}
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
                          onChange={event => updateFinanceRow(row.month, "faturamento", Number(event.target.value || 0))}
                        />
                      ) : money.format(row.faturamento)}
                    </td>
                    <td>
                      {financeEditMode && !presentation ? (
                        <input
                          className="indicator-inline-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={Number.isFinite(row.custo) ? row.custo : 0}
                          onChange={event => updateFinanceRow(row.month, "custo", Number(event.target.value || 0))}
                        />
                      ) : money.format(row.custo)}
                    </td>
                    <td>{percent.format(row.percent)}</td>
                    <td>{percent.format(row.meta)}</td>
                    <td>{money.format(row.metric)}</td>
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
            title="Turnover 2026"
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
            title="Absenteísmo 2026"
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
          <div className="indicator-tabs">
            {demoCompetencies.map(item => (
              <button key={item.id} className={competency === item.id ? "active" : ""} onClick={() => setCompetency(item.id)}>{item.label}</button>
            ))}
          </div>
          <button type="button" className="secondary indicator-present-all" onClick={() => setPresentationTarget("all")}>
            Apresentar todos
          </button>
        </div>
        <div className="indicator-tabs center-tabs">
          {demoResultCenters.map(center => (
            <button key={center.id} className={selectedCenter === center.code ? "active" : ""} onClick={() => setSelectedCenter(center.code as CenterCode)}>{center.code}</button>
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

function DemoOnly() {
  return <div className="panel"><span className="eyebrow">Módulo demo</span><h2>Disponível na versão de apresentação</h2><p>Este módulo usa dados fictícios locais quando `VITE_DEMO_MODE=true`.</p></div>;
}

function PageShell({ title, subtitle, error = "", success = "", children }: { title: string; subtitle: string; error?: string; success?: string; children: ReactNode }) {
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">Demo</span>
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
