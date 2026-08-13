# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import date
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
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
OUTPUT = ROOT / "entregas" / "Nexo 1.0.0 - Playbook Operacional.pdf"
LOGO = ROOT / "frontend" / "src" / "assets" / "nexo-logo-horizontal.png"

NAVY = colors.HexColor("#173B67")
BLUE = colors.HexColor("#2563EB")
GREEN = colors.HexColor("#12805C")
AMBER = colors.HexColor("#C97808")
RED = colors.HexColor("#C0392B")
TEXT = colors.HexColor("#172033")
MUTED = colors.HexColor("#667085")
LIGHT = colors.HexColor("#F4F6F9")
PALE_BLUE = colors.HexColor("#EDF4FF")
PALE_GREEN = colors.HexColor("#EAF7F1")
PALE_AMBER = colors.HexColor("#FFF6E5")
PALE_RED = colors.HexColor("#FFF0EF")
LINE = colors.HexColor("#D9E1EA")
WHITE = colors.white


def register_fonts() -> tuple[str, str]:
    regular = Path(r"C:\Windows\Fonts\arial.ttf")
    bold = Path(r"C:\Windows\Fonts\arialbd.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("NexoSans", str(regular)))
        pdfmetrics.registerFont(TTFont("NexoSans-Bold", str(bold)))
        return "NexoSans", "NexoSans-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "CoverTitle", fontName=FONT_BOLD, fontSize=30, leading=36,
        textColor=NAVY, alignment=TA_CENTER, spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        "CoverSub", fontName=FONT, fontSize=14, leading=20,
        textColor=MUTED, alignment=TA_CENTER, spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        "Chapter", fontName=FONT_BOLD, fontSize=21, leading=26,
        textColor=NAVY, spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        "Heading", fontName=FONT_BOLD, fontSize=13, leading=17,
        textColor=NAVY, spaceBefore=9, spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        "BodyNexo", fontName=FONT, fontSize=9.5, leading=14,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        "BodyBold", fontName=FONT_BOLD, fontSize=9.5, leading=14,
        textColor=TEXT, spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        "SmallNexo", fontName=FONT, fontSize=8, leading=11,
        textColor=MUTED,
    ))
    styles.add(ParagraphStyle(
        "SmallWhite", fontName=FONT, fontSize=8, leading=11,
        textColor=WHITE,
    ))
    styles.add(ParagraphStyle(
        "TableHead", fontName=FONT_BOLD, fontSize=8, leading=10,
        textColor=WHITE, alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "TableCell", fontName=FONT, fontSize=7.8, leading=10.5,
        textColor=TEXT,
    ))
    styles.add(ParagraphStyle(
        "StepNo", fontName=FONT_BOLD, fontSize=13, leading=16,
        textColor=WHITE, alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "StepTitle", fontName=FONT_BOLD, fontSize=10, leading=13,
        textColor=NAVY, spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        "Footer", fontName=FONT, fontSize=7.5, leading=9,
        textColor=MUTED,
    ))
    return styles


S = make_styles()


def p(text: str, style: str = "BodyNexo") -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), S[style])


def rich(text: str, style: str = "BodyNexo") -> Paragraph:
    return Paragraph(text, S[style])


def heading(text: str) -> Paragraph:
    return p(text, "Heading")


def bullets(items: list[str]) -> list[Paragraph]:
    return [rich(f"<bullet>•</bullet>{escape(item)}", "BodyNexo") for item in items]


def numbered_steps(items: list[tuple[str, str]]) -> list[KeepTogether]:
    result = []
    for index, (title, detail) in enumerate(items, start=1):
        badge = Table([[Paragraph(str(index), S["StepNo"])]], colWidths=[0.72 * cm], rowHeights=[0.72 * cm])
        badge.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BLUE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 0, BLUE),
        ]))
        content = [p(title, "StepTitle"), p(detail)]
        row = Table([[badge, content]], colWidths=[1.0 * cm, 16.0 * cm], hAlign="LEFT")
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        result.append(KeepTogether([row]))
    return result


def data_table(headers: list[str], rows: list[list[str]], widths: list[float] | None = None) -> Table:
    data = [[p(item, "TableHead") for item in headers]]
    data.extend([[p(str(item), "TableCell") for item in row] for row in rows])
    table = Table(data, colWidths=[value * cm for value in widths] if widths else None, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def callout(title: str, text: str, kind: str = "info") -> Table:
    palette = {
        "info": (PALE_BLUE, BLUE),
        "success": (PALE_GREEN, GREEN),
        "warning": (PALE_AMBER, AMBER),
        "danger": (PALE_RED, RED),
    }
    background, accent = palette[kind]
    table = Table([[[p(title, "BodyBold"), p(text)]]], colWidths=[17.0 * cm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def chapter(story: list, number: str, title: str, subtitle: str) -> None:
    story.append(PageBreak())
    story.append(p(f"CAPÍTULO {number}", "SmallNexo"))
    story.append(p(title, "Chapter"))
    story.append(p(subtitle))
    story.append(Spacer(1, 0.15 * cm))


def process_flow(labels: list[str]) -> Table:
    cells = []
    for index, label in enumerate(labels):
        cells.append(p(label, "TableCell"))
        if index < len(labels) - 1:
            cells.append(p("→", "BodyBold"))
    widths = []
    for index in range(len(cells)):
        widths.append((16.8 / len(labels)) * cm if index % 2 == 0 else 0.45 * cm)
    table = Table([cells], colWidths=widths, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]
    for index in range(0, len(cells), 2):
        style.extend([
            ("BACKGROUND", (index, 0), (index, 0), PALE_BLUE),
            ("BOX", (index, 0), (index, 0), 0.5, BLUE),
        ])
    table.setStyle(TableStyle(style))
    return table


def page_header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.line(2 * cm, height - 1.25 * cm, width - 2 * cm, height - 1.25 * cm)
        canvas.setFont(FONT_BOLD, 8)
        canvas.setFillColor(NAVY)
        canvas.drawString(2 * cm, height - 0.95 * cm, "NEXO 1.0.0 · PLAYBOOK OPERACIONAL")
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(width - 2 * cm, height - 0.95 * cm, "Uso interno e implantação assistida")
        canvas.line(2 * cm, 1.25 * cm, width - 2 * cm, 1.25 * cm)
        canvas.drawString(2 * cm, 0.85 * cm, "Documento controlado · Versão 1.0")
        canvas.drawRightString(width - 2 * cm, 0.85 * cm, f"Página {doc.page}")
    canvas.restoreState()


def build_story() -> list:
    story: list = []

    story.append(Spacer(1, 2.2 * cm))
    if LOGO.exists():
        logo = Image(str(LOGO), width=7.8 * cm, height=2.0 * cm)
        logo.hAlign = "CENTER"
        story.append(logo)
    story.append(Spacer(1, 1.0 * cm))
    story.append(p("Playbook Operacional", "CoverTitle"))
    story.append(p("Implantação, uso, governança, fechamento e continuidade", "CoverSub"))
    story.append(Spacer(1, 0.5 * cm))
    cover_line = Table([[p("VERSÃO DO SISTEMA", "SmallWhite"), p("1.0.0", "SmallWhite"), p("EDIÇÃO", "SmallWhite"), p("1.0 · 03/08/2026", "SmallWhite")]], colWidths=[3.7 * cm, 3.0 * cm, 2.3 * cm, 4.4 * cm], hAlign="CENTER")
    cover_line.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(cover_line)
    story.append(Spacer(1, 2.0 * cm))
    story.append(callout("Objetivo do documento", "Padronizar a utilização do Nexo, reduzir erros operacionais e garantir rastreabilidade, proteção dos dados e continuidade do trabalho entre Administradores e Consultores.", "info"))
    story.append(Spacer(1, 2.5 * cm))
    story.append(p("Nexo · Custos & Pessoas", "CoverSub"))

    chapter(story, "00", "Controle do documento", "Como utilizar, manter e atualizar este playbook.")
    story.append(data_table(
        ["Campo", "Definição"],
        [
            ["Proprietário", "Administrador responsável pelo Nexo na empresa"],
            ["Público", "Administradores, Consultores, suporte técnico e responsáveis pelos processos de pessoas e custos"],
            ["Periodicidade de revisão", "A cada atualização do sistema ou alteração relevante no processo"],
            ["Fonte oficial", "Repositório RH-CONTROL e pasta de entrega da versão 1.0.0"],
            ["Classificação", "Uso interno; contém procedimentos relacionados a dados pessoais"],
        ],
        [4.0, 13.0],
    ))
    story.append(heading("Regras de uso"))
    story.extend(bullets([
        "Use este documento como roteiro de implantação, treinamento e operação recorrente.",
        "Sempre confirme a empresa e a competência antes de incluir, editar ou fechar informações.",
        "Não compartilhe credenciais. Cada pessoa deve usar seu próprio usuário.",
        "Apenas o Administrador executa configurações, restauração, atualização e ações restritas.",
        "Registre exceções e justificativas no próprio sistema para preservar a auditoria.",
    ]))
    story.append(heading("Sumário executivo"))
    story.append(data_table(
        ["Parte", "Conteúdo"],
        [
            ["1 a 4", "Modelo operacional, papéis, arquitetura e implantação"],
            ["5 a 10", "Configuração inicial, empresas, cadastros, movimentações e contratos MEI"],
            ["11 a 16", "Benefícios, custo/folha, fechamento, indicadores e relatórios"],
            ["17 a 20", "Alertas, auditoria, rotinas diárias e ciclo mensal"],
            ["21 a 24", "Backup, atualização, segurança e resposta a incidentes"],
            ["25", "Checklists de aceite, operação e continuidade"],
        ],
        [3.0, 14.0],
    ))

    chapter(story, "01", "Modelo operacional", "Entenda onde os dados ficam e como as estações trabalham em conjunto.")
    story.append(process_flow(["Servidor principal", "API Nexo", "Rede local", "Aplicativos clientes"]))
    story.append(Spacer(1, 0.35 * cm))
    story.append(p("O PostgreSQL e a API ficam no computador principal. O aplicativo instalado nas demais máquinas é uma interface cliente: ele consulta e grava os mesmos dados pela rede local. Isso mantém uma única fonte oficial para todas as empresas e usuários."))
    story.append(callout("Regra de ouro", "Em produção, não use armazenamento local ou modo demo. Se o servidor estiver indisponível, interrompa os lançamentos e acione o Administrador; não crie uma base paralela.", "warning"))
    story.append(heading("Condições para operação"))
    story.extend(bullets([
        "Computador principal ligado e conectado à rede durante todo o período de uso.",
        "IP fixo ou reserva de IP configurada para o servidor.",
        "PostgreSQL ativo na porta 5432 e API Nexo ativa na porta 8000.",
        "Estações clientes na mesma rede privada e configuradas com o endereço correto.",
        "Backup diário monitorado e cópia externa periódica.",
    ]))

    chapter(story, "02", "Papéis e responsabilidades", "Separe configuração, operação e consulta para reduzir riscos.")
    story.append(data_table(
        ["Atividade", "Administrador", "Consultor", "Suporte técnico"],
        [
            ["Consultar dashboard, cadastros e relatórios", "Executa", "Executa", "Somente sob autorização"],
            ["Cadastrar e editar dados operacionais", "Executa", "Conforme permissão", "Não executa"],
            ["Configurar empresas, CRs, cargos e encargos", "Responsável", "Consulta", "Apoia tecnicamente"],
            ["Gerenciar usuários", "Responsável", "Sem acesso", "Apoia em incidentes"],
            ["Fechar ou reabrir competência", "Responsável", "Consulta", "Não executa"],
            ["Criar, validar e restaurar backup", "Solicita/valida", "Sem acesso", "Executa restauração assistida"],
            ["Atualizar servidor e clientes", "Autoriza", "É comunicado", "Executa e valida"],
        ],
        [5.0, 3.8, 3.8, 4.4],
    ))
    story.append(callout("Segregação mínima", "O usuário Administrador não deve ser compartilhado. Crie usuários nominais e desative imediatamente acessos de pessoas desligadas ou sem necessidade operacional.", "danger"))

    chapter(story, "03", "Implantação do servidor", "Procedimento para o computador principal da empresa.")
    story.extend(numbered_steps([
        ("Preparar o computador", "Confirme Windows atualizado, acesso de Administrador, internet na primeira instalação, rede privada e espaço para banco e backups."),
        ("Executar o instalador", "Clique com o botão direito em Nexo-Servidor-Setup-1.0.0.exe e selecione Executar como administrador."),
        ("Definir senhas", "Informe a senha administrativa do PostgreSQL e a senha inicial do usuário admin do Nexo. Use ao menos oito caracteres e guarde em cofre seguro."),
        ("Aguardar configuração", "O instalador prepara Python, PostgreSQL, banco, migrations, seed, API, firewall e backup diário. Não feche a janela durante o processo."),
        ("Validar o servidor", "Abra PowerShell como Administrador e rode C:\\Nexo\\scripts\\server-status.ps1. Confirme PostgreSQL True, API True e Saúde da API ok."),
        ("Registrar o endereço", "Anote o endereço IPv4 da rede privada exibido no diagnóstico, como http://192.168.0.10:8000."),
    ]))
    story.append(callout("Não prossiga", "Se Saúde da API estiver indisponível, corrija o servidor antes de instalar clientes. Envie ao suporte o diagnóstico e os logs de C:\\Nexo\\logs, nunca as senhas.", "danger"))

    chapter(story, "04", "Implantação dos clientes", "Instalação no computador principal e nas demais estações.")
    story.extend(numbered_steps([
        ("Instalar o cliente", "Execute Nexo-Cliente-Setup-1.0.0.exe no computador principal e em cada estação autorizada."),
        ("Abrir o Nexo", "Na primeira abertura, será exibida a tela de conexão com o servidor."),
        ("Informar o endereço", "Digite o IPv4 do servidor com a porta 8000, por exemplo http://192.168.0.10:8000, e clique em Salvar e conectar."),
        ("Autenticar", "Use admin somente no primeiro acesso. Depois, utilize um usuário nominal criado em Ajustes do sistema."),
        ("Confirmar sincronismo", "Compare empresa selecionada e quantidade de colaboradores em duas estações. Os dados devem ser iguais."),
    ]))
    story.append(callout("Endereço incorreto", "127.0.0.1 aponta para o próprio computador. Use esse endereço somente quando cliente e servidor estiverem na mesma máquina.", "warning"))

    chapter(story, "05", "Configuração inicial", "Sequência recomendada antes dos primeiros lançamentos.")
    story.append(process_flow(["Empresa", "Parâmetros", "Cadastros-base", "Usuários", "Colaboradores"]))
    story.append(heading("Ordem obrigatória"))
    story.extend(numbered_steps([
        ("Cadastrar empresas", "Cadastre o CNPJ, consulte os dados públicos, confira razão social, endereço e situação cadastral. Defina uma única empresa principal."),
        ("Configurar cada empresa", "Selecione a empresa e ajuste percentuais de encargos, mês inicial, logo e parâmetros. O nome e CNPJ exibidos na aba Geral são dados controlados pelo cadastro da empresa."),
        ("Cadastrar estruturas", "Crie Centros de Resultado, modalidades de contratação e cargos/funções. Use nomes padronizados em caixa alta quando aplicável."),
        ("Cadastrar usuários", "Crie usuários nominais, defina Administrador ou Consultor e valide o primeiro acesso."),
        ("Cadastrar colaboradores", "Somente depois das estruturas estarem prontas, inclua os colaboradores na empresa correta."),
        ("Executar conferência", "Compare totais por empresa, modalidade e Centro de Resultado antes de iniciar benefícios e fechamento."),
    ]))

    chapter(story, "06", "Empresas e escopo multiempresa", "Como evitar lançamentos na empresa errada.")
    story.append(p("O seletor global define o escopo das telas. A opção Todas as empresas é destinada a consultas consolidadas. Operações que dependem de parâmetros próprios devem ser realizadas com uma empresa específica selecionada."))
    story.append(data_table(
        ["Ação", "Escopo recomendado", "Controle"],
        [
            ["Consultar dashboard e relatórios consolidados", "Todas as empresas", "Conferir se a consolidação é desejada"],
            ["Cadastrar colaborador", "Empresa específica", "Empresa também deve ser confirmada no formulário"],
            ["Editar encargos e configurações", "Empresa específica", "Nome e CNPJ são somente leitura na aba Geral"],
            ["Distribuir benefícios", "Empresa específica", "Filtros e elegibilidade usam cadastros daquela empresa"],
            ["Editar custo/folha", "Empresa específica", "Percentuais variam por empresa"],
            ["Fechar competência", "Empresa específica", "Fechamento independente por empresa"],
        ],
        [5.4, 4.0, 7.6],
    ))
    story.append(heading("Alterações cadastrais"))
    story.extend(bullets([
        "Empresas com lançamentos não devem ser excluídas; use Inativar.",
        "Empresas inativas permanecem disponíveis para histórico e auditoria.",
        "Ao definir uma nova empresa principal, a anterior deixa automaticamente de ser principal.",
        "Após cadastrar ou editar uma empresa, atualize a visão e confirme o seletor global.",
    ]))

    chapter(story, "07", "Ajustes do sistema", "Área administrativa para configurações controladas.")
    story.append(data_table(
        ["Cadastro", "Finalidade", "Regra de controle"],
        [
            ["Geral", "Mês inicial, logo e informações da empresa selecionada", "Nome e CNPJ são controlados no cadastro da empresa"],
            ["Encargos", "Percentuais usados no custo/folha", "Revisar por empresa e documentar alterações"],
            ["Centros de Resultado", "Estrutura de análise e geração de matrícula", "Código único, curto e estável"],
            ["Modalidades", "CLT, MEI, pró-labore e demais vínculos", "Definir corretamente incidência de encargos"],
            ["Cargos/funções", "Lista padronizada do cadastro", "Manter sem duplicidade; ordem alfabética"],
            ["Usuários", "Controle de acesso", "Usuários nominais e perfil mínimo necessário"],
            ["Importação", "Carga e exportação de cadastros", "Validar arquivo e resultado antes de uso"],
            ["Backup", "Criar, validar e baixar cópia integral", "Acesso exclusivo de Administrador"],
        ],
        [3.2, 7.2, 6.6],
    ))
    story.append(callout("Mudança de parâmetros", "Alterações de encargos afetam cálculos futuros e competências abertas. Antes de mudar, confirme a empresa, registre a justificativa e gere um backup.", "warning"))

    chapter(story, "08", "Cadastro de colaboradores", "Padrão de qualidade para a base de pessoas.")
    story.append(heading("Fluxo de inclusão"))
    story.extend(numbered_steps([
        ("Selecionar a empresa", "Escolha a empresa no seletor global e confirme o campo Empresa no cadastro."),
        ("Preencher identificação", "Informe nome, CPF ou CNPJ válido. O sistema deve bloquear documento inválido ou já cadastrado e indicar o registro conflitante."),
        ("Definir vínculo", "Escolha modalidade, Centro de Resultado, cargo/função, data de admissão e situação."),
        ("Definir supervisão", "Selecione uma pessoa cadastrada com cargo de Supervisor. Caso o cargo não exista, use o botão + para cadastro rápido."),
        ("Preencher contato e endereço", "Informe e-mail, telefone e CEP. Após a busca do CEP, confira número e complemento."),
        ("Preencher dados bancários", "Selecione banco, agência, conta, tipo de PIX e chave. PIX é obrigatório e deve respeitar o formato selecionado."),
        ("Configurar benefícios", "Marque apenas os benefícios elegíveis. Para Ajuda de custo, marque a opção e informe o valor; não existe cálculo automático."),
        ("Salvar e conferir", "A matrícula será criada no padrão SIGLA-SEQ, por exemplo ADM-003. Abra a ficha e revise todos os dados."),
    ]))
    story.append(data_table(
        ["Campo", "Validação"],
        [
            ["CPF/CNPJ", "Dígitos verificadores, quantidade correta e ausência de duplicidade"],
            ["Matrícula", "Gerada automaticamente com base no Centro de Resultado"],
            ["E-mail", "Formato válido contendo @"],
            ["Telefone", "DDD e número válidos"],
            ["CEP", "Busca automática; número e complemento continuam sob responsabilidade do usuário"],
            ["PIX CPF/CNPJ", "Quantidade e dígitos válidos; Meu CPF preenche o documento cadastrado"],
            ["PIX telefone", "DDD obrigatório; Meu celular usa o telefone cadastrado"],
        ],
        [4.0, 13.0],
    ))

    chapter(story, "09", "Edição, salário e histórico", "Diferencie correção cadastral de evento salarial.")
    story.append(data_table(
        ["Opção", "Quando usar", "Efeito"],
        [
            ["Correção cadastral", "Valor anterior foi digitado incorretamente", "Atualiza o último salário sem criar um novo evento histórico"],
            ["Ajuste salarial", "Houve aumento, redução ou mudança salarial efetiva", "Cria histórico salarial e nova movimentação com data e motivo"],
        ],
        [4.2, 6.0, 6.8],
    ))
    story.append(callout("Proteção do histórico", "Nunca use correção cadastral para esconder uma alteração real. Registros históricos alimentam relatórios, auditoria e análise por competência.", "danger"))
    story.append(heading("Ordem da ficha"))
    story.extend(bullets([
        "Férias: períodos e situação.",
        "Afastamentos: motivo, período, dias e horas.",
        "Históricos salariais: vigências e valores.",
        "Histórico de movimentos: alterações e eventos recebidos de outros módulos.",
    ]))

    chapter(story, "10", "Movimentações e contratos MEI", "Registre eventos de forma rastreável e vinculada.")
    story.append(heading("Nova movimentação"))
    story.extend(numbered_steps([
        ("Abrir Nova movimentação", "O sistema exibe um formulário em popup; nenhum registro é criado antes da confirmação."),
        ("Selecionar modalidade e CR", "Esses dois campos liberam os demais e limitam a busca, reduzindo carga e risco de escolher a pessoa errada."),
        ("Selecionar colaborador", "Escolha somente após conferir empresa, modalidade e Centro de Resultado."),
        ("Informar evento", "Preencha tipo, competência, datas, dias, horas e observação."),
        ("Salvar e conferir", "Valide a linha gerada e o histórico do colaborador. Edições protegidas podem solicitar senha."),
    ]))
    story.append(heading("Contrato de MEI"))
    story.append(process_flow(["Selecionar MEI", "Informar vigência", "Pendente", "Anexar contrato", "Ativo"]))
    story.extend(bullets([
        "Somente colaboradores cadastrados na modalidade MEI devem ser selecionados.",
        "Enquanto não assinado, o contrato gera alerta e movimentação de pendência.",
        "Ao informar assinatura, anexe o contrato para ativar o registro.",
        "Com 15 dias para vencer, o contrato entra em alertas; com 10 dias, fica laranja; com 5 dias, fica vermelho e gera movimentação.",
    ]))

    chapter(story, "11", "Benefícios", "Distribuição mensal em lote ou individual com elegibilidade e rastreabilidade.")
    story.append(process_flow(["Definir filtros", "Aplicar filtro", "Revisar pessoas", "Ajustar valores", "Confirmar"]))
    story.append(heading("Preparar o lançamento"))
    story.extend(numbered_steps([
        ("Selecionar empresa e competência", "Trabalhe sempre em empresa específica e confirme se a competência está aberta."),
        ("Escolher um benefício", "Distribua apenas um tipo por operação: Vale transporte, Alimentação, Plano de saúde ou Seguro de vida."),
        ("Definir filtros", "Informe modalidade, Centro de Resultado, UF e, opcionalmente, supervisor e busca por nome."),
        ("Aplicar o filtro", "Os filtros são travados e a lista mostra somente colaboradores ativos e elegíveis, conforme benefícios marcados no cadastro."),
        ("Revisar a lista", "Remova pessoas pelo X ou use Adicionar colaborador. Inclusões fora do filtro exigem confirmação consciente."),
        ("Aplicar padrão do lote", "Informe dias e valor diário, ou valores mensais. Clique OK para sobrepor os valores dos selecionados."),
        ("Ajustar exceções", "Edite dias, valor titular, dependentes e valor por dependente diretamente na linha quando necessário."),
        ("Confirmar distribuição", "Informe descrição obrigatória, confirme e baixe Excel ou PDF para conferência."),
    ]))
    story.append(data_table(
        ["Benefício", "Campos principais", "Total"],
        [
            ["Vale transporte", "Dias trabalhados e valor por dia", "Dias × valor diário"],
            ["Alimentação", "Dias trabalhados e valor por dia", "Dias × valor diário"],
            ["Plano de saúde", "Valor titular, quantidade de dependentes e valor por dependente", "Titular + dependentes × valor"],
            ["Seguro de vida", "Valor mensal", "Valor informado"],
        ],
        [4.0, 7.8, 5.2],
    ))
    story.append(callout("Correção antes do fechamento", "Distribuições confirmadas podem ser revisadas e alteradas enquanto a competência estiver aberta. Após o fechamento, reabra formalmente a competência antes de corrigir.", "warning"))

    chapter(story, "12", "Custo / Folha", "Controle mensal de custos sem objetivo de gerar folha de pagamento.")
    story.append(p("A tela consolida remuneração, benefícios, encargos, provisões e total por colaborador. Ela é uma visão gerencial de custos; não substitui o processamento legal da folha."))
    story.append(data_table(
        ["Bloco", "Componentes", "Regra"],
        [
            ["Remuneração", "Salário, pró-labore, distribuição de lucro e ajuda de custo", "Valores cadastrais ou ajustados por competência"],
            ["Encargos", "INSS, RAT, terceiros e FGTS", "Percentuais configurados por empresa sobre bases elegíveis"],
            ["Provisões", "Férias, 1/3, FGTS, 13º, aviso, multa e patronal", "Cálculos derivados das bases configuradas"],
            ["Benefícios", "Transporte, alimentação, hospedagem, seguro e plano de saúde", "Somados ao custo total, fora da base salarial de encargos"],
            ["Total geral", "Remuneração + encargos + provisões + benefícios", "Custo mensal gerencial"],
        ],
        [3.0, 8.5, 5.5],
    ))
    story.append(heading("Modo de edição"))
    story.extend(numbered_steps([
        ("Selecionar empresa", "A edição não deve ser feita em Todas as empresas, pois percentuais e parâmetros variam."),
        ("Selecionar competência, CR e modalidade", "Use os filtros para reduzir o conjunto antes de editar."),
        ("Entrar em modo edição", "Somente Administradores podem editar os valores permitidos."),
        ("Alterar campos", "Ajuste benefícios ou ajuda de custo quando necessário. Não atribua valor automático à ajuda de custo."),
        ("Salvar alterações", "Clique em Salvar alterações e recarregue a visão para confirmar a persistência."),
        ("Exportar", "Use Baixar Excel no rodapé da tabela para conciliação."),
    ]))
    story.append(callout("Conferência crítica", "Benefícios compõem o total geral, mas não integram automaticamente a base de INSS, FGTS e demais encargos calculados sobre salário.", "success"))

    chapter(story, "13", "Fechamento mensal", "Controle formal para congelar a competência e alimentar indicadores.")
    story.append(process_flow(["Selecionar mês", "Conferir checklist", "Tratar pendências", "Justificar exceção", "Fechar"]))
    story.extend(numbered_steps([
        ("Selecionar empresa e competência", "É permitido fechar meses anteriores. Nunca execute fechamento em Todas as empresas."),
        ("Revisar cadastros e movimentos", "Confirme admissões, desligamentos, afastamentos, férias, salários e contratos MEI."),
        ("Revisar benefícios", "O sistema alerta quando um benefício marcado no cadastro não possui distribuição no mês."),
        ("Tratar pendências", "Distribua o benefício ou registre justificativa formal. A justificativa fica em movimentações para rastreabilidade."),
        ("Revisar custo/folha", "Compare subtotal, encargos, provisões, benefícios e total geral."),
        ("Fechar competência", "Clique em Fechar competência. O mês fechado passa a alimentar indicadores e bloqueia alterações operacionais sensíveis."),
        ("Gerar relatório", "Emita o relatório de fechamento e arquive junto à conferência mensal."),
    ]))
    story.append(callout("Reabertura", "Reabra somente com autorização, motivo documentado e backup recente. Após as correções, execute novamente toda a conferência e feche o mês.", "danger"))

    chapter(story, "14", "Indicadores", "Leitura baseada em competências efetivamente fechadas.")
    story.append(p("Os indicadores não devem repetir valores fictícios nem projetar automaticamente meses sem fechamento. Competências sem dados confirmados permanecem zeradas ou em branco, conforme o indicador."))
    story.append(data_table(
        ["Indicador", "Fonte", "Interpretação"],
        [
            ["Custo total", "Custo/folha da competência fechada", "Remuneração, encargos, provisões e benefícios"],
            ["Custo / faturamento", "Custo fechado e faturamento informado manualmente", "Comparação mensal e meta"],
            ["Turnover", "Admissões, desligamentos e efetivo", "((admissões + desligamentos) / 2) / colaboradores"],
            ["Absenteísmo", "Horas não produtivas e programadas", "Horas não produtivas / horas programadas"],
            ["Comparativo por CR", "Cadastros e movimentos fechados", "ADM, IND, COM e DIR lado a lado"],
        ],
        [3.5, 6.4, 7.1],
    ))
    story.append(heading("Operação"))
    story.extend(bullets([
        "Selecione o ano, a competência e o Centro de Resultado.",
        "Use o lápis somente em Custo / Faturamento para registrar faturamento e métricas externas.",
        "Use o ícone de exibição de cada tópico para apresentação ampliada.",
        "Apresentar todos abre os tópicos em sequência para reunião gerencial.",
        "Investigue divergências na fonte antes de ajustar dados externos.",
    ]))

    chapter(story, "15", "Relatórios", "Emissão padronizada para conferência e tomada de decisão.")
    story.append(data_table(
        ["Relatório", "Uso principal"],
        [
            ["Consolidado mensal", "Resumo executivo por Centro de Resultado"],
            ["Colaboradores ativos", "Conferência cadastral e de elegibilidade"],
            ["Movimentações", "Eventos do mês e histórico operacional"],
            ["Afastamentos financeiros", "Dias, horas e impactos associados"],
            ["Turnover e absenteísmo", "Indicadores de pessoas por período"],
            ["Histórico salarial", "Evolução salarial e justificativas"],
            ["Vale transporte", "Dias, valor diário e total distribuído"],
            ["Alimentação", "Distribuições em lote e individuais"],
            ["Plano de saúde", "Titular, dependentes e valores"],
            ["Seguro de vida", "Distribuição mensal por colaborador"],
        ],
        [5.2, 11.8],
    ))
    story.extend(numbered_steps([
        ("Definir filtros", "Selecione empresa, competência, CR, modalidade, UF, supervisor e busca quando disponíveis."),
        ("Visualizar", "Confira cabeçalho, logo, linhas e totais. O modelo de impressão mantém cada registro em uma única linha, sem grade visual."),
        ("Comparar", "Confronte totais com Custo/Folha ou Benefícios antes de distribuir o documento."),
        ("Exportar", "Gere PDF ou Excel conforme o objetivo e aplique o controle de acesso adequado."),
    ]))

    chapter(story, "16", "Relatório Maker", "Crie análises reutilizáveis sem perder o vínculo com o período selecionado.")
    story.extend(numbered_steps([
        ("Escolher a fonte", "Selecione Custo/Folha, Colaboradores, Benefícios ou outra fonte disponibilizada."),
        ("Selecionar competência", "O resultado e os modelos abertos devem sempre respeitar o período ativo."),
        ("Montar colunas", "Escolha campos, agregações, agrupamentos e filtros. Use moeda somente para valores em reais."),
        ("Validar o total", "A soma total corresponde ao relatório construído, já considerando filtros e agrupamento."),
        ("Salvar modelo", "Clique em Salvar modelo, informe nome claro e confirme no popup. Cada salvamento cria ou atualiza o modelo selecionado sem apagar os demais."),
        ("Reabrir modelo", "Use a lista suspensa Relatórios salvos. Digite parte do nome para localizar e abrir."),
        ("Executar em outro período", "Altere a competência e execute novamente; a estrutura é preservada, mas os dados pertencem ao período escolhido."),
    ]))
    story.append(callout("Padrão de nomes", "Use AREA - OBJETIVO - PERIODICIDADE, por exemplo: ADM - CUSTO POR SUPERVISOR - MENSAL.", "info"))

    chapter(story, "17", "Alertas e auditoria", "Transforme registros em lembretes e evidências de controle.")
    story.append(data_table(
        ["Severidade", "Cor", "Conduta"],
        [
            ["Baixa", "Amarelo", "Planejar tratamento e acompanhar"],
            ["Média", "Laranja", "Priorizar e definir responsável"],
            ["Alta", "Vermelho", "Tratar imediatamente e registrar a solução"],
        ],
        [3.0, 3.0, 11.0],
    ))
    story.append(heading("Alertas"))
    story.extend(bullets([
        "Acompanhe férias vencendo, retorno de afastamentos, contratos MEI e pendências de benefícios.",
        "Atribua responsável e prazo fora do sistema quando o alerta exigir ação entre áreas.",
        "Não apague evidências; resolva a causa e mantenha o histórico correspondente.",
    ]))
    story.append(heading("Auditoria"))
    story.extend(bullets([
        "Use filtros por usuário, data, empresa e tipo de evento para investigar alterações.",
        "Compare o evento com movimentações e histórico do colaborador.",
        "Em caso de suspeita, preserve logs, backup e evidências antes de corrigir dados.",
    ]))

    chapter(story, "18", "Rotina diária", "Checklist de abertura, operação e encerramento do dia.")
    story.append(data_table(
        ["Momento", "Responsável", "Atividade", "Evidência"],
        [
            ["Início do dia", "Administrador", "Confirmar acesso ao Nexo e empresa correta", "Dashboard abre sem erro"],
            ["Início do dia", "Administrador", "Revisar alertas altos e médios", "Pendências direcionadas"],
            ["Durante o dia", "Operador", "Cadastrar e conferir alterações", "Ficha e histórico atualizados"],
            ["Durante o dia", "Operador", "Registrar movimentações e contratos", "Evento visível na competência"],
            ["Fim do dia", "Administrador", "Verificar erros e alterações críticas", "Auditoria revisada"],
            ["Após 02:00", "Administrador", "Confirmar backup diário", "Arquivo .dump válido"],
        ],
        [2.5, 3.0, 7.5, 4.0],
    ))

    chapter(story, "19", "Ciclo mensal", "Processo recomendado do primeiro lançamento ao fechamento.")
    story.append(data_table(
        ["Etapa", "Janela sugerida", "Saída esperada"],
        [
            ["Atualizar cadastros", "Durante todo o mês", "Base ativa e vínculos corretos"],
            ["Registrar movimentos", "No momento do evento", "Histórico completo"],
            ["Atualizar contratos MEI", "Antes da vigência/assinatura", "Contratos ativos e anexados"],
            ["Distribuir benefícios", "Antes do fechamento", "Todos os elegíveis tratados"],
            ["Conferir custo/folha", "Após benefícios e movimentos", "Totais conciliados"],
            ["Informar faturamento", "Antes da reunião de indicadores", "Comparativo financeiro completo"],
            ["Fechar competência", "Após aprovação", "Mês bloqueado e indicadores atualizados"],
            ["Emitir relatórios", "Após fechamento", "Pacote mensal arquivado"],
            ["Copiar backup", "Após fechamento", "Cópia externa protegida"],
        ],
        [4.1, 4.4, 8.5],
    ))

    chapter(story, "20", "Backup e restauração", "Proteção integral de todas as empresas e históricos.")
    story.append(p("O backup do Nexo é global. Ele inclui todas as empresas, usuários, colaboradores, vínculos, históricos, benefícios, contratos, movimentações, competências, configurações, auditoria, faturamento e modelos de relatório armazenados no PostgreSQL."))
    story.append(heading("Backup automático"))
    story.extend(bullets([
        "Tarefa do Windows: Nexo Backup Diario.",
        "Horário padrão: 02:00.",
        "Pasta padrão: C:\\Nexo\\backups.",
        "Formato: .dump customizado e validado pelo PostgreSQL.",
        "Arquivos incompletos usam extensão .partial e não devem ser restaurados.",
    ]))
    story.append(heading("Backup manual"))
    story.append(callout("Comando", "powershell -ExecutionPolicy Bypass -File C:\\Nexo\\scripts\\server-backup.ps1", "info"))
    story.append(heading("Restauração assistida"))
    story.extend(numbered_steps([
        ("Interromper o uso", "Avise todos os usuários e feche o Nexo nas estações."),
        ("Confirmar o arquivo", "Escolha um .dump validado e copie para local acessível no servidor."),
        ("Abrir PowerShell como Administrador", "A restauração exige privilégio elevado."),
        ("Executar o script", "Use server-restore.ps1 com o parâmetro -BackupFile e o caminho completo."),
        ("Aguardar", "O script cria backup preventivo, restaura os dados, reaplica migrations e reinicia a API."),
        ("Validar", "Teste login, empresas, colaboradores, competência e totais antes de liberar o uso."),
    ]))
    story.append(callout("Regra 3-2-1", "Mantenha pelo menos três cópias, em duas mídias diferentes, sendo uma fora do computador principal e protegida contra acesso indevido.", "success"))

    chapter(story, "21", "Atualização controlada", "Como evoluir o sistema sem perder dados.")
    story.extend(numbered_steps([
        ("Planejar a janela", "Comunique usuários, encerre lançamentos e escolha horário de baixo impacto."),
        ("Confirmar saúde", "Rode server-status.ps1 e resolva falhas antes de atualizar."),
        ("Gerar backup adicional", "Crie backup manual e copie para local externo."),
        ("Executar nova versão", "Instale por cima da existente. Não apague C:\\Nexo nem desinstale PostgreSQL."),
        ("Aguardar a barreira de segurança", "O atualizador cria e valida outro backup antes de migrations. Se falhar, a atualização é cancelada."),
        ("Atualizar clientes", "Distribua o instalador ou use a atualização publicada pelo GitHub Releases."),
        ("Executar smoke test", "Valide login, empresa, colaboradores, benefícios, custo/folha, indicadores, fechamento e backup."),
        ("Liberar o uso", "Registre versão, data, responsável e resultado da validação."),
    ]))

    chapter(story, "22", "Segurança e LGPD", "Controles mínimos para dados pessoais e financeiros.")
    story.append(data_table(
        ["Risco", "Controle operacional"],
        [
            ["Compartilhamento de senha", "Usuários nominais, perfil mínimo e desativação imediata"],
            ["Acesso externo indevido", "Não publicar porta 8000; usar VPN ou proxy HTTPS administrado"],
            ["Perda de dados", "Backup diário, cópia externa e teste periódico de restauração"],
            ["Alteração não rastreada", "Auditoria, movimentações, histórico e justificativas"],
            ["Exposição de relatórios", "Acesso restrito, armazenamento protegido e descarte seguro"],
            ["Vazamento por suporte", "Enviar logs sem senhas, tokens, backups ou dados desnecessários"],
            ["Estação perdida", "Bloqueio do Windows e remoção do usuário; senha lembrada usa criptografia do Windows"],
        ],
        [5.0, 12.0],
    ))
    story.append(callout("Dados sensíveis", "Backups e relatórios podem conter CPF, endereço, contato, dados bancários, salários e informações de saúde. Restrinja acesso e transporte esses arquivos de forma segura.", "danger"))

    chapter(story, "23", "Resposta a incidentes", "Procedimentos curtos para recuperar a operação com segurança.")
    story.append(data_table(
        ["Sintoma", "Diagnóstico", "Resposta"],
        [
            ["Cliente não conecta", "Confirmar rede e endereço; rodar server-status.ps1", "Corrigir IP, API ou firewall; não ativar base local"],
            ["API 8000 indisponível", "Ver tarefa Nexo API e logs", "Reiniciar tarefa; acionar suporte se não recuperar"],
            ["PostgreSQL indisponível", "Ver serviço e porta 5432", "Não reinstalar; reiniciar serviço ou acionar suporte"],
            ["Login inválido", "Confirmar usuário ativo e senha", "Administrador redefine acesso; não compartilhar admin"],
            ["Dados parecem incorretos", "Confirmar empresa, competência e filtros", "Corrigir fonte; usar histórico e auditoria"],
            ["Backup diário ausente", "Ver tarefa e espaço em disco", "Gerar backup manual e corrigir agendamento"],
            ["Atualização falhou", "Consultar install.log e backup preventivo", "Manter versão anterior; não apagar banco"],
            ["Exclusão ou alteração indevida", "Preservar auditoria e backup", "Interromper uso e planejar restauração assistida"],
        ],
        [4.0, 5.3, 7.7],
    ))
    story.append(heading("Coleta para suporte"))
    story.extend(bullets([
        "Data, hora, usuário, empresa e competência do problema.",
        "Passos executados antes do erro e mensagem exibida.",
        "Resultado do server-status.ps1.",
        "Logs de C:\\Nexo\\logs.",
        "Captura de tela sem exposição desnecessária de dados pessoais.",
    ]))

    chapter(story, "24", "Matriz de troubleshooting", "Consultas rápidas antes de escalar um chamado.")
    story.append(data_table(
        ["Pergunta", "Sim", "Não"],
        [
            ["O servidor principal está ligado?", "Avance", "Ligue e aguarde a inicialização"],
            ["A estação está na mesma rede?", "Avance", "Conecte à rede correta"],
            ["O endereço usa o IP do servidor?", "Avance", "Corrija; não use 127.0.0.1 remotamente"],
            ["Saúde da API está ok?", "Teste o login", "Analise tarefa, porta e logs"],
            ["O usuário está ativo?", "Validar senha e perfil", "Administrador deve reativar ou criar acesso"],
            ["Empresa e competência estão corretas?", "Investigue a fonte", "Corrija filtros antes de editar"],
            ["Existe backup recente validado?", "Planeje recuperação", "Crie backup antes de qualquer intervenção"],
        ],
        [7.5, 4.5, 5.0],
    ))

    chapter(story, "25", "Checklists de controle", "Listas prontas para implantação, fechamento e continuidade.")
    story.append(heading("Aceite da implantação"))
    story.extend(bullets([
        "[ ] Servidor principal instalado como Administrador.",
        "[ ] PostgreSQL 5432 e API 8000 disponíveis.",
        "[ ] Saúde da API igual a ok.",
        "[ ] IP do servidor reservado na rede.",
        "[ ] Cliente instalado no servidor e nas estações.",
        "[ ] Login nominal validado em pelo menos duas máquinas.",
        "[ ] Empresa principal e empresas adicionais conferidas.",
        "[ ] CRs, modalidades, cargos e encargos revisados por empresa.",
        "[ ] Backup manual criado, validado e copiado externamente.",
        "[ ] Responsáveis treinados neste playbook.",
    ]))
    story.append(heading("Aceite do fechamento mensal"))
    story.extend(bullets([
        "[ ] Empresa e competência confirmadas.",
        "[ ] Admissões, desligamentos, férias e afastamentos registrados.",
        "[ ] Alterações salariais classificadas corretamente.",
        "[ ] Contratos MEI atualizados e anexados.",
        "[ ] Todos os benefícios elegíveis distribuídos ou justificados.",
        "[ ] Custo/folha conciliado.",
        "[ ] Competência fechada e relatório emitido.",
        "[ ] Indicadores revisados.",
        "[ ] Backup pós-fechamento criado e copiado externamente.",
    ]))
    story.append(heading("Teste trimestral de continuidade"))
    story.extend(bullets([
        "[ ] Confirmar execução diária da tarefa de backup.",
        "[ ] Selecionar backup recente e validar integridade.",
        "[ ] Restaurar em ambiente controlado.",
        "[ ] Comparar empresas, usuários, colaboradores e totais.",
        "[ ] Registrar data, responsável, duração e resultado.",
        "[ ] Corrigir qualquer falha antes do próximo ciclo.",
    ]))
    story.append(Spacer(1, 0.5 * cm))
    story.append(callout("Encerramento", "O Nexo é confiável quando processo, responsabilidade e evidência caminham juntos. Cadastre na empresa correta, trabalhe por competência, preserve o histórico e nunca deixe o backup sem verificação.", "success"))

    story.append(PageBreak())
    story.append(Spacer(1, 5.0 * cm))
    if LOGO.exists():
        logo = Image(str(LOGO), width=6.8 * cm, height=1.75 * cm)
        logo.hAlign = "CENTER"
        story.append(logo)
    story.append(Spacer(1, 0.7 * cm))
    story.append(p("Playbook Operacional · Nexo 1.0.0", "CoverSub"))
    story.append(p("Documento preparado para implantação, treinamento e operação controlada.", "CoverSub"))
    story.append(Spacer(1, 1.0 * cm))
    story.append(p(f"Gerado em {date.today().strftime('%d/%m/%Y')}", "SmallNexo"))
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=1.65 * cm,
        bottomMargin=1.6 * cm,
        title="Nexo 1.0.0 - Playbook Operacional",
        author="Nexo - Custos & Pessoas",
        subject="Implantação, operação, governança, backup e continuidade",
    )
    document.build(build_story(), onFirstPage=page_header_footer, onLaterPages=page_header_footer)
    print(f"Playbook gerado: {OUTPUT}")


if __name__ == "__main__":
    main()
