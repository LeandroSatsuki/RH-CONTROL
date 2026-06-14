# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
ENTREGAS = ROOT / "entregas"
OUTPUT = ENTREGAS / "Nexo - Apresentacao Formal do Programa.pdf"
LOGO = ENTREGAS / "nexo-logo-horizontal.png"

NAVY = colors.HexColor("#173B67")
BLUE = colors.HexColor("#2563EB")
GREEN = colors.HexColor("#10B981")
AMBER = colors.HexColor("#F59E0B")
PURPLE = colors.HexColor("#8B5CF6")
TEXT = colors.HexColor("#162033")
MUTED = colors.HexColor("#687386")
LIGHT = colors.HexColor("#F4F6F9")
LINE = colors.HexColor("#DEE5EE")


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="CoverTitle",
        parent=base["Title"],
        fontName="Helvetica-Bold",
        fontSize=32,
        leading=38,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=12,
    ))
    base.add(ParagraphStyle(
        name="CoverSubtitle",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=15,
        leading=22,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceAfter=18,
    ))
    base.add(ParagraphStyle(
        name="SectionTitle",
        parent=base["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=22,
        textColor=NAVY,
        spaceBefore=12,
        spaceAfter=8,
    ))
    base.add(ParagraphStyle(
        name="SubTitle",
        parent=base["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=16,
        textColor=TEXT,
        spaceBefore=8,
        spaceAfter=4,
    ))
    base.add(ParagraphStyle(
        name="Body",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=TEXT,
        alignment=TA_LEFT,
        spaceAfter=7,
    ))
    base.add(ParagraphStyle(
        name="Small",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=MUTED,
    ))
    base.add(ParagraphStyle(
        name="NexoBullet",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=10.2,
        leading=14,
        textColor=TEXT,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=4,
    ))
    base.add(ParagraphStyle(
        name="Callout",
        parent=base["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=18,
        textColor=NAVY,
        alignment=TA_CENTER,
    ))
    return base


S = styles()


def p(text: str, style: str = "Body") -> Paragraph:
    return Paragraph(text, S[style])


def bullet(text: str) -> Paragraph:
    return p(f"• {text}", "NexoBullet")


def section(title: str):
    return p(title, "SectionTitle")


def table(data, widths=None, header=True):
    parsed = [[p(str(cell), "Body") if not isinstance(cell, Paragraph) else cell for cell in row] for row in data]
    tbl = Table(parsed, colWidths=widths, hAlign="LEFT")
    style = [
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]
    tbl.setStyle(TableStyle(style))
    return tbl


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 1.0 * cm, width, 1.0 * cm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(1.6 * cm, height - 0.63 * cm, "Nexo | Apresentação formal do programa")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 1.6 * cm, 0.95 * cm, f"Página {doc.page}")
    canvas.restoreState()


def add_cover(story):
    story.append(Spacer(1, 1.0 * cm))
    if LOGO.exists():
        story.append(Image(str(LOGO), width=12.0 * cm, height=3.6 * cm, hAlign="CENTER"))
    story.append(Spacer(1, 1.0 * cm))
    story.append(p("Apresentação Formal do Programa", "CoverTitle"))
    story.append(p("Controle de pessoas, custos e indicadores para gestão administrativa e financeira.", "CoverSubtitle"))
    story.append(Spacer(1, 0.8 * cm))
    story.append(table([
        ["Programa", "Nexo"],
        ["Finalidade", "Controle gerencial de colaboradores, custos, benefícios, contratos, alertas e indicadores."],
        ["Versão apresentada", "MVP demonstrável com base pronta para evolução real."],
        ["Investimento sugerido", "R$ 4.000,00"],
    ], widths=[4.0 * cm, 11.0 * cm], header=False))
    story.append(Spacer(1, 1.0 * cm))
    story.append(p("Este documento descreve o escopo funcional, a proposta de valor e a composição da entrega inicial do Nexo.", "Callout"))
    story.append(PageBreak())


def add_intro(story):
    story.append(section("1. Visão geral"))
    story.append(p("O Nexo é um sistema desenvolvido para apoiar o controle de pessoas, custos e indicadores em empresas que hoje dependem de planilhas para acompanhar dados de folha, benefícios, movimentações, contratos e centros de resultado."))
    story.append(p("A proposta do MVP é entregar uma base funcional e organizada, com foco em controle gerencial, rastreabilidade e leitura executiva. Nesta fase, o sistema não tem como objetivo substituir a folha oficial nem executar todos os cálculos legais de folha de pagamento."))
    story.append(p("O foco é criar um ambiente confiável para consolidar dados, acompanhar custos por competência, registrar eventos relevantes, visualizar indicadores e preparar a evolução para uma implantação real com API, banco de dados e integrações futuras."))

    story.append(section("2. Objetivos do programa"))
    for item in [
        "Centralizar informações de colaboradores, empresas, centros de resultado e modalidades.",
        "Controlar custos mensais, benefícios, contratos e movimentações.",
        "Acompanhar indicadores como custo, turnover e absenteísmo.",
        "Criar relatórios gerenciais e permitir consultas customizadas.",
        "Reduzir retrabalho e dependência de planilhas isoladas.",
        "Oferecer base modular para evolução do produto.",
    ]:
        story.append(bullet(item))


def add_scope(story):
    story.append(section("3. Funcionalidades incluídas no MVP"))
    data = [
        ["Módulo", "Funcionalidades principais"],
        ["Multiempresas", "Cadastro e seleção de múltiplas empresas, visão individual e consolidada, configurações separadas por empresa."],
        ["Colaboradores", "CPF/CNPJ, matrícula automática, supervisor, cargo/função, CEP, endereço, dados bancários, PIX obrigatório e benefícios elegíveis."],
        ["Centros de Resultado", "Estrutura ADM, IND, COM e DIR, usada em filtros, indicadores, custos e relatórios."],
        ["Modalidades", "Controle de CLT, MEI, pró-labore, freelancer e outras modalidades."],
        ["Custo / Folha gerencial", "Remunerações, benefícios, encargos, provisões, total geral, edição controlada e exportação para Excel."],
        ["Benefícios", "Distribuição por competência, filtros, lote, ajuste individual, dependentes no plano de saúde e exportação."],
        ["Fechamento mensal", "Checklist, validação de pendências de benefícios e justificativas registradas."],
        ["Contratos MEI", "Vigência, contrato pendente de assinatura, anexo, status ativo e alertas por prazo."],
        ["Indicadores", "Custo total, custo/faturamento, turnover, absenteísmo e comparação por Centro de Resultado."],
        ["Relatórios", "Relatórios financeiros, afastamentos, benefícios, filtros básicos e impressão em formato de planilha."],
        ["Relatório Maker", "Criação de relatórios personalizados, modelos salvos, busca e filtros por período."],
        ["Alertas e auditoria", "Lembretes operacionais, severidade visual e registro de ações realizadas no sistema."],
        ["Ajustes do sistema", "Usuários, cargos/funções, logo, Centros de Resultado, modalidades, backup e importação."],
    ]
    story.append(table(data, widths=[4.0 * cm, 11.5 * cm]))


def add_value(story):
    story.append(section("4. Valor para o cliente"))
    story.append(p("O Nexo entrega valor ao transformar uma rotina fragmentada em uma operação organizada e consultável. A empresa passa a ter um local único para acompanhar colaboradores, custos, benefícios, contratos, alertas e indicadores."))
    story.append(KeepTogether([
        p("Principais ganhos esperados:", "SubTitle"),
        bullet("Menor dependência de planilhas manuais."),
        bullet("Mais clareza sobre custos por Centro de Resultado."),
        bullet("Melhor controle de benefícios e pendências de fechamento."),
        bullet("Rastreabilidade de alterações e justificativas."),
        bullet("Visualização gerencial para tomada de decisão."),
        bullet("Base técnica preparada para evoluir em novas fases."),
    ]))

    story.append(section("5. Entregáveis"))
    story.append(table([
        ["Entregável", "Descrição"],
        ["Sistema demo web", "Frontend React/Vite em modo demonstração, sem necessidade de backend."],
        ["Aplicativo Windows portable", "Executável demo para apresentação local ao cliente."],
        ["Base técnica modular", "Código organizado com frontend, backend FastAPI, estrutura PostgreSQL e scripts."],
        ["Material comercial", "Documento de funcionalidades, apresentação PowerPoint e este PDF formal."],
        ["Repositório versionado", "Projeto atualizado no GitHub para continuidade do desenvolvimento."],
    ], widths=[4.5 * cm, 11.0 * cm]))


def add_commercial(story):
    story.append(section("6. Proposta comercial"))
    story.append(p("Considerando o escopo descrito, a entrega inicial do MVP Nexo é proposta pelo valor de:"))
    story.append(Spacer(1, 0.2 * cm))
    story.append(table([
        ["Item", "Valor"],
        ["MVP Nexo - controle de pessoas, custos e indicadores", "R$ 4.000,00"],
    ], widths=[10.5 * cm, 4.5 * cm]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(p("Sugestão de condição de pagamento: 50% na aprovação da proposta e 50% na entrega validada do MVP.", "Body"))
    story.append(p("Evoluções futuras podem ser tratadas por módulo adicional ou por pacote mensal de melhorias, conforme prioridade do cliente.", "Body"))

    story.append(section("7. Fora do escopo da fase inicial"))
    for item in [
        "Geração oficial completa de folha de pagamento.",
        "eSocial, integração bancária ou assinatura digital real.",
        "Cálculos legais completos de folha.",
        "Importação definitiva da planilha do cliente.",
        "Instalador Windows definitivo com serviço local.",
        "Hospedagem em produção e integrações com sistemas externos.",
    ]:
        story.append(bullet(item))

    story.append(section("8. Próximos passos recomendados"))
    for item in [
        "Apresentar a demo e validar aderência com o cliente.",
        "Confirmar o escopo do MVP fechado em R$ 4.000,00.",
        "Priorizar ajustes obrigatórios antes da implantação real.",
        "Planejar a fase de produção com banco de dados, usuários reais e backup operacional.",
        "Definir roadmap de evoluções por módulo.",
    ]:
        story.append(bullet(item))


def add_appendix(story):
    story.append(PageBreak())
    story.append(section("Anexo - Credenciais e demonstração"))
    story.append(p("A versão demo pode ser executada sem API, PostgreSQL, migrations ou backend. Ela utiliza dados fictícios locais e permite apresentar o fluxo completo do produto."))
    story.append(table([
        ["Perfil", "Usuário", "Senha"],
        ["Administrador", "admin", "admin"],
        ["Consultor", "consultor", "consultor"],
    ], widths=[5.0 * cm, 5.0 * cm, 5.0 * cm]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(p("Aplicativo demo Windows:", "SubTitle"))
    story.append(p("frontend/release/Nexo-Demo-0.1.0-Portable.exe", "Body"))
    story.append(p("Este documento foi preparado para apoiar a apresentação comercial e a precificação do MVP com o cliente.", "Small"))


def build_pdf():
    ENTREGAS.mkdir(exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.55 * cm,
        bottomMargin=1.45 * cm,
        title="Nexo - Apresentação Formal do Programa",
        author="Nexo",
    )
    story = []
    add_cover(story)
    add_intro(story)
    add_scope(story)
    add_value(story)
    add_commercial(story)
    add_appendix(story)
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
