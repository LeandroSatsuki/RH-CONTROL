# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt
from pptx.chart.data import CategoryChartData


ROOT = Path(__file__).resolve().parents[1]
ENTREGAS = ROOT / "entregas"
FRONTEND_BUILD = ROOT / "frontend" / "build"
FRONTEND_ASSETS = ROOT / "frontend" / "src" / "assets"

NAVY = RGBColor(23, 59, 103)
BLUE = RGBColor(37, 99, 235)
GREEN = RGBColor(16, 185, 129)
AMBER = RGBColor(245, 158, 11)
PURPLE = RGBColor(139, 92, 246)
TEXT = RGBColor(22, 32, 51)
MUTED = RGBColor(104, 115, 134)
LIGHT = RGBColor(244, 246, 249)
WHITE = RGBColor(255, 255, 255)
LINE = RGBColor(222, 229, 238)


def font(size: int, bold: bool = False):
    try:
        return ImageFont.truetype("segoeui.ttf" if not bold else "segoeuib.ttf", size)
    except OSError:
        return ImageFont.load_default()


def draw_logo_mark(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = int(size * 0.09)
    radius = int(size * 0.20)
    draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill=(23, 59, 103, 255),
    )

    nodes = [
        (int(size * 0.28), int(size * 0.34)),
        (int(size * 0.46), int(size * 0.23)),
        (int(size * 0.70), int(size * 0.33)),
        (int(size * 0.33), int(size * 0.66)),
        (int(size * 0.57), int(size * 0.55)),
        (int(size * 0.74), int(size * 0.72)),
    ]
    links = [(0, 1), (1, 2), (0, 3), (3, 4), (4, 2), (4, 5)]
    for a, b in links:
        draw.line((nodes[a], nodes[b]), fill=(142, 197, 255, 255), width=int(size * 0.035))
    for index, point in enumerate(nodes):
        fill = [(255, 255, 255, 255), (16, 185, 129, 255), (245, 158, 11, 255), (255, 255, 255, 255), (37, 99, 235, 255), (139, 92, 246, 255)][index]
        r = int(size * 0.055)
        draw.ellipse((point[0] - r, point[1] - r, point[0] + r, point[1] + r), fill=fill)

    draw.text((int(size * 0.29), int(size * 0.39)), "N", font=font(int(size * 0.30), True), fill=(255, 255, 255, 255))
    return img


def draw_logo_horizontal() -> Image.Image:
    img = Image.new("RGBA", (1800, 540), (0, 0, 0, 0))
    mark = draw_logo_mark(420)
    img.alpha_composite(mark, (40, 60))
    draw = ImageDraw.Draw(img)
    draw.text((520, 110), "Nexo", font=font(180, True), fill=(23, 59, 103, 255))
    draw.text((532, 308), "Custos, Pessoas e Indicadores", font=font(48), fill=(104, 115, 134, 255))
    return img


def save_logo_assets():
    ENTREGAS.mkdir(exist_ok=True)
    FRONTEND_BUILD.mkdir(exist_ok=True)
    FRONTEND_ASSETS.mkdir(exist_ok=True)

    mark = draw_logo_mark()
    horizontal = draw_logo_horizontal()

    mark.save(ENTREGAS / "nexo-logo.png")
    horizontal.save(ENTREGAS / "nexo-logo-horizontal.png")
    mark.save(FRONTEND_BUILD / "icon.png")
    horizontal.save(FRONTEND_BUILD / "nexo-logo-horizontal.png")
    mark.save(FRONTEND_ASSETS / "nexo-logo-mark.png")
    horizontal.save(FRONTEND_ASSETS / "nexo-logo-horizontal.png")

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    mark.save(FRONTEND_BUILD / "icon.ico", sizes=ico_sizes)


def set_background(slide, color=LIGHT):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color


def add_text(slide, text, x, y, w, h, size=24, color=TEXT, bold=False, align=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear()
    frame.margin_left = 0
    frame.margin_right = 0
    frame.vertical_anchor = MSO_ANCHOR.TOP
    p = frame.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = "Segoe UI"
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def add_bullets(slide, bullets, x, y, w, h, size=18, color=TEXT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear()
    frame.margin_left = 0
    frame.margin_right = 0
    frame.word_wrap = True
    for index, bullet in enumerate(bullets):
        p = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        p.text = bullet
        p.level = 0
        p.font.name = "Segoe UI"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.space_after = Pt(8)
    return box


def add_header(slide, title, subtitle=None):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(0.72))
    bar.fill.solid()
    bar.fill.fore_color.rgb = NAVY
    bar.line.fill.background()
    add_text(slide, title, 0.55, 0.16, 8.8, 0.35, 19, WHITE, True)
    if subtitle:
        add_text(slide, subtitle, 0.58, 0.95, 8.8, 0.3, 15, MUTED, False)
    slide.shapes.add_picture(str(ENTREGAS / "nexo-logo-horizontal.png"), Inches(10.55), Inches(0.08), width=Inches(2.05))


def add_card(slide, title, body, x, y, w, h, color=NAVY):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = WHITE
    shape.line.color.rgb = LINE
    add_text(slide, title, x + 0.22, y + 0.20, w - 0.44, 0.28, 13, color, True)
    add_text(slide, body, x + 0.22, y + 0.58, w - 0.44, h - 0.7, 12, MUTED)


def add_metric(slide, label, value, x, y, color):
    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(2.25), Inches(1.05))
    box.fill.solid()
    box.fill.fore_color.rgb = WHITE
    box.line.color.rgb = LINE
    add_text(slide, label, x + 0.15, y + 0.14, 1.95, 0.22, 9, MUTED, True)
    add_text(slide, value, x + 0.15, y + 0.45, 1.95, 0.36, 18, color, True)


def add_simple_table(slide, x, y, w, h):
    rows, cols = 5, 4
    table = slide.shapes.add_table(rows, cols, Inches(x), Inches(y), Inches(w), Inches(h)).table
    widths = [1.4, 1.5, 1.5, 1.4]
    for i, width in enumerate(widths):
        table.columns[i].width = Inches(width)
    data = [
        ["CR", "Custo", "Turnover", "Absenteísmo"],
        ["ADM", "R$ 183 mil", "1,47%", "9,94%"],
        ["IND", "R$ 171 mil", "14,29%", "5,75%"],
        ["COM", "R$ 157 mil", "5,56%", "6,40%"],
        ["DIR", "R$ 154 mil", "0,00%", "3,70%"],
    ]
    for r in range(rows):
        for c in range(cols):
            cell = table.cell(r, c)
            cell.text = data[r][c]
            cell.fill.solid()
            cell.fill.fore_color.rgb = NAVY if r == 0 else WHITE
            for p in cell.text_frame.paragraphs:
                p.font.name = "Segoe UI"
                p.font.size = Pt(10)
                p.font.bold = r == 0
                p.font.color.rgb = WHITE if r == 0 else TEXT


def add_bar_chart(slide, x, y, w, h):
    chart_data = CategoryChartData()
    chart_data.categories = ["Jan", "Fev", "Mar", "Abr"]
    chart_data.add_series("Faturamento", (1908, 1434, 1662, 1747))
    chart_data.add_series("Custo", (183, 171, 157, 155))
    chart = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), chart_data).chart
    chart.has_legend = True
    chart.legend.include_in_layout = False
    chart.category_axis.tick_labels.font.size = Pt(9)
    chart.value_axis.tick_labels.font.size = Pt(9)
    chart.chart_title.has_text_frame = True
    chart.chart_title.text_frame.text = "Custo x Faturamento"


def make_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    # Slide 1
    s = prs.slides.add_slide(blank)
    set_background(s, NAVY)
    s.shapes.add_picture(str(ENTREGAS / "nexo-logo-horizontal.png"), Inches(0.7), Inches(0.7), width=Inches(4.4))
    add_text(s, "Controle de pessoas, custos e indicadores", 0.78, 2.35, 7.7, 0.65, 30, WHITE, True)
    add_text(s, "MVP funcional para substituir controles fragmentados em planilhas por uma base gerencial organizada.", 0.82, 3.12, 7.4, 0.8, 18, RGBColor(217, 227, 239))
    add_metric(s, "INVESTIMENTO", "R$ 4.000", 0.82, 4.55, GREEN)
    add_metric(s, "ENTREGA", "Demo + Base", 3.28, 4.55, AMBER)
    add_metric(s, "FOCO", "Controle", 5.74, 4.55, BLUE)
    add_text(s, "Proposta comercial do MVP", 0.83, 6.58, 5.2, 0.3, 12, RGBColor(217, 227, 239))

    # Slide 2
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Por que o Nexo faz sentido", "O cliente precisa de controle, não de geração completa de folha.")
    add_card(s, "Dor atual", "Informações importantes ficam espalhadas em planilhas, sem fluxo único para custos, benefícios, alertas e histórico.", 0.75, 1.55, 3.7, 1.55, AMBER)
    add_card(s, "Resposta do MVP", "Organizar a base por empresa, competência, colaborador, Centro de Resultado e modalidade.", 4.82, 1.55, 3.7, 1.55, BLUE)
    add_card(s, "Valor prático", "Dar visão gerencial, rastreabilidade e relatórios antes de avançar para automações mais complexas.", 8.9, 1.55, 3.7, 1.55, GREEN)
    add_bullets(s, ["Centraliza dados operacionais e financeiros.", "Reduz retrabalho em conferências mensais.", "Cria base confiável para indicadores.", "Permite evolução por fases sem jogar fora o MVP."], 1.0, 3.7, 11.0, 2.4, 20)

    # Slide 3
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Escopo entregue no MVP", "Módulos principais que compõem a proposta.")
    cards = [
        ("Multiempresas", "Empresas separadas e visão consolidada."),
        ("Colaboradores", "CPF/CNPJ, matrícula, supervisor, CEP, banco e PIX."),
        ("Custo / Folha", "Remuneração, benefícios, encargos, provisões e total."),
        ("Benefícios", "Distribuição em lote, ajustes individuais e exportação."),
        ("Indicadores", "Custo, turnover, absenteísmo e comparação por CR."),
        ("Relatório Maker", "Modelos personalizados e filtros por período."),
        ("Contratos MEI", "Vigência, assinatura, anexo e alertas."),
        ("Auditoria", "Registro de ações e alterações do usuário."),
        ("Ajustes", "Usuários, cargos, logo, CR, modalidades e backup."),
    ]
    for i, (title, body) in enumerate(cards):
        add_card(s, title, body, 0.65 + (i % 3) * 4.18, 1.35 + (i // 3) * 1.55, 3.75, 1.18, [BLUE, GREEN, AMBER, PURPLE][i % 4])

    # Slide 4
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Multiempresas e Centros de Resultado", "A leitura pode ser consolidada ou por empresa.")
    add_bullets(s, ["Filtro de empresa com visão de Todas Empresas.", "Configurações por empresa, incluindo logo, jornada e encargos.", "Centros de Resultado ADM, IND, COM e DIR.", "Base preparada para matriz, filial e empresas independentes."], 0.8, 1.45, 5.4, 3.4, 18)
    add_simple_table(s, 6.4, 1.45, 5.8, 2.6)
    add_text(s, "A lógica do sistema acompanha a operação real: o cliente pode enxergar separado quando precisa e consolidado quando quer visão executiva.", 6.5, 4.65, 5.5, 1.0, 17, MUTED)

    # Slide 5
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Cadastro de colaboradores", "Cadastro mais seguro e pronto para controle.")
    add_bullets(s, ["CPF/CNPJ com validação e duplicidade em tempo de cadastro.", "Matrícula automática usando a sigla do Centro de Resultado.", "Supervisor por lista de pessoas com cargo de supervisor.", "Cargo/função administrado em configurações.", "CEP com preenchimento automático e campos bloqueados.", "PIX obrigatório e validado por tipo."], 0.85, 1.35, 6.4, 4.5, 17)
    add_card(s, "Histórico preservado", "A estrutura mantém informações históricas para evitar que ajustes atuais apaguem leituras antigas.", 7.55, 1.55, 4.7, 1.45, GREEN)
    add_card(s, "Dados bancários", "Banco, agência, conta, dígito e chave PIX ficam no cadastro do colaborador.", 7.55, 3.35, 4.7, 1.45, BLUE)
    add_card(s, "Benefícios elegíveis", "O colaborador só aparece em lançamentos compatíveis com os benefícios marcados no cadastro.", 7.55, 5.15, 4.7, 1.45, AMBER)

    # Slide 6
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Custo / Folha gerencial", "Controle de custo mensal, sem substituir a folha oficial.")
    add_bullets(s, ["Colaborador, Centro de Resultado e modalidade.", "Salário, pró-labore, lucro, ajuda de custo e benefícios.", "INSS, RAT, Terceiros, FGTS e total de encargos.", "Férias, 13º, aviso, multa FGTS, patronal e total de provisões.", "Total geral e exportação para Excel."], 0.75, 1.35, 5.7, 4.2, 17)
    add_bar_chart(s, 6.75, 1.55, 5.55, 3.9)
    add_text(s, "A tela foi desenhada para conferência e controle financeiro, com modo de edição para pontos permitidos.", 6.85, 5.75, 5.3, 0.75, 16, MUTED)

    # Slide 7
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Benefícios e fechamento", "Distribuição prática e controle de pendências.")
    add_card(s, "Distribuição", "Vale transporte, alimentação, plano de saúde e seguro de vida por competência.", 0.75, 1.35, 3.75, 1.55, BLUE)
    add_card(s, "Filtros", "Modalidade, UF, CR, supervisor e colaboradores elegíveis conforme cadastro.", 4.8, 1.35, 3.75, 1.55, GREEN)
    add_card(s, "Ajustes", "Lote com dias/valor e ajuste individual por colaborador.", 8.85, 1.35, 3.75, 1.55, AMBER)
    add_bullets(s, ["Plano de saúde permite dependente e valor adicional.", "Ao confirmar, alimenta custo/folha e relatórios.", "Fechamento bloqueia pendências sem justificativa.", "Exportação em Excel/PDF para conferência."], 1.05, 3.75, 11.0, 2.0, 19)

    # Slide 8
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Indicadores", "Layout inspirado na planilha de referência do cliente.")
    add_bullets(s, ["Custo total com provisões.", "Custo x faturamento com edição de faturamento.", "Turnover e absenteísmo por competência.", "Comparativo por Centro de Resultado.", "Modo de apresentação em tela ampliada."], 0.75, 1.4, 5.4, 3.8, 18)
    add_simple_table(s, 6.35, 1.35, 5.8, 2.55)
    add_metric(s, "META TURNOVER", "5,00%", 6.4, 4.35, GREEN)
    add_metric(s, "META ABSENTEÍSMO", "10,00%", 8.88, 4.35, AMBER)
    add_metric(s, "CRs", "ADM IND COM DIR", 6.4, 5.65, BLUE)

    # Slide 9
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Relatórios e Relatório Maker", "Além de relatórios fixos, o cliente monta suas próprias visões.")
    add_bullets(s, ["Relatórios financeiros e operacionais.", "Relatórios por benefício.", "Relatório de afastamento.", "Filtros básicos no topo de cada relatório.", "Modelos personalizados salvos no Relatório Maker.", "Busca por texto em relatórios salvos."], 0.85, 1.35, 6.1, 4.4, 17)
    add_card(s, "Diferencial comercial", "O Relatório Maker dá liberdade para combinar campos, filtros e totais sem pedir uma tela nova a cada necessidade.", 7.35, 1.65, 4.75, 1.65, PURPLE)
    add_card(s, "Uso futuro", "Essa base abre caminho para exportações avançadas, dashboards customizados e rotinas de análise recorrentes.", 7.35, 3.85, 4.75, 1.65, GREEN)

    # Slide 10
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Controle operacional", "Lembretes e rastreabilidade para reduzir risco.")
    add_bullets(s, ["Contratos MEI com vigência, assinatura e anexo.", "Alertas de férias, afastamentos, contratos e ajustes pendentes.", "Severidade visual: baixa, média e alta.", "Movimentações com edição protegida por senha.", "Auditoria/logs para saber quem fez cada alteração."], 0.85, 1.45, 6.0, 4.2, 18)
    add_card(s, "Administração", "Ajustes do sistema concentra usuários, cargos, empresas, CRs, modalidades, logo, importação e backup.", 7.25, 1.6, 4.95, 1.7, BLUE)
    add_card(s, "Governança", "A informação deixa de depender apenas da memória do usuário e passa a ter registro e alerta.", 7.25, 3.95, 4.95, 1.7, AMBER)

    # Slide 11
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "O que está incluso nos R$ 4.000", "Composição da entrega inicial.")
    add_bullets(s, ["MVP funcional com modo demo.", "Aplicativo Windows portable sem backend.", "Build web estático para publicação.", "Base real preservada com FastAPI e PostgreSQL.", "Documentação de execução e apresentação.", "Código versionado no GitHub.", "Material comercial e apresentação para validação."], 0.85, 1.35, 7.0, 4.9, 18)
    add_metric(s, "PROPOSTA", "R$ 4.000", 8.55, 1.6, GREEN)
    add_metric(s, "SUGESTÃO", "50% + 50%", 8.55, 2.95, BLUE)
    add_metric(s, "FASE", "MVP", 8.55, 4.3, AMBER)

    # Slide 12
    s = prs.slides.add_slide(blank)
    set_background(s)
    add_header(s, "Fora do escopo inicial", "Itens importantes, mas recomendados para fases futuras.")
    add_bullets(s, ["Geração oficial completa de folha.", "eSocial, integração bancária ou assinatura digital real.", "Instalador Windows definitivo com serviço local.", "Importação definitiva da planilha do cliente.", "Integrações com sistemas externos.", "Hospedagem e operação em produção."], 0.95, 1.35, 10.7, 4.1, 19)
    add_text(s, "Esse recorte protege o orçamento inicial e entrega valor rápido, sem travar o produto em uma primeira fase grande demais.", 1.0, 6.05, 10.6, 0.55, 17, NAVY, True)

    # Slide 13
    s = prs.slides.add_slide(blank)
    set_background(s, NAVY)
    s.shapes.add_picture(str(ENTREGAS / "nexo-logo-horizontal.png"), Inches(0.75), Inches(0.65), width=Inches(4.0))
    add_text(s, "Próximo passo", 0.85, 2.2, 5.5, 0.55, 32, WHITE, True)
    add_bullets(s, ["Validar a demo com o cliente.", "Fechar o MVP por R$ 4.000,00.", "Aprovar ajustes finais de fluxo.", "Planejar implantação real e próximas fases."], 0.95, 3.05, 7.5, 2.6, 22, WHITE)
    add_text(s, "Nexo: o elo entre pessoas, custos e decisões.", 0.9, 6.55, 7.0, 0.35, 14, RGBColor(217, 227, 239))

    prs.save(ENTREGAS / "Nexo - Apresentacao Comercial MVP.pptx")


def main():
    save_logo_assets()
    make_presentation()


if __name__ == "__main__":
    main()
