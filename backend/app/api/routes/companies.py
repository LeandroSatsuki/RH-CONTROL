from __future__ import annotations

import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.core.config import settings
from app.models.company import Company
from app.models.employment_type import EmploymentType
from app.models.result_center import ResultCenter
from app.models.system_setting import SystemSetting
from app.models.enums import CompanyKind
from app.schemas.catalog import (
    CompanyCreate,
    CompanyLookupRead,
    CompanyRead,
    CompanyUpdate,
    is_valid_cnpj,
)
from app.api.routes.demo import DEFAULT_JOB_TITLES, DEFAULT_PAYROLL_RATES

router = APIRouter()


def normalize_cnpj(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if not is_valid_cnpj(digits):
        raise HTTPException(status_code=422, detail="CNPJ inválido")
    return digits


def company_code(name: str, cnpj: str | None = None) -> str:
    base = re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")[:16] or "EMPRESA"
    if cnpj:
        suffix = cnpj[-4:]
        candidate = f"{base[:12]}-{suffix}"
        return candidate[:20]
    return base[:20]


def request_json(url: str, headers: dict[str, str] | None = None) -> dict[str, object]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "Nexo/1.0.0 (+consulta-cnpj)",
        **(headers or {}),
    }
    request = Request(url, headers=request_headers)
    with urlopen(request, timeout=settings.cnpj_lookup_timeout_seconds) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def get_any(payload: dict[str, object], *keys: str, default: str = "") -> str:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return str(value)
    return default


def format_cnpj(value: str) -> str:
    digits = normalize_cnpj(value)
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"


def build_company_lookup(
    payload: dict[str, object], source: str, cnpj: str
) -> CompanyLookupRead:
    name = get_any(
        payload, "nomeEmpresarial", "razao_social", "razaoSocial", "nome", default=""
    )
    trade_name = get_any(
        payload,
        "nomeFantasia",
        "nome_fantasia",
        "nomeFantasiaEstabelecimento",
        "fantasia",
        default="",
    )
    status = get_any(
        payload,
        "situacaoCadastral",
        "descricaoSituacaoCadastral",
        "descricao_situacao_cadastral",
        "situacao_cadastral",
        "situacao",
        default="",
    )
    opening_date = get_any(
        payload,
        "dataInicioAtividade",
        "data_inicio_atividade",
        "dataAbertura",
        "abertura",
        default="",
    )
    kind_text = get_any(
        payload,
        "descricaoTipoEstabelecimento",
        "tipoEstabelecimento",
        "matrizFilial",
        "descricao_identificador_matriz_filial",
        "tipo",
        default="",
    )
    kind = CompanyKind.OUTRA
    if "filial" in kind_text.lower():
        kind = CompanyKind.FILIAL
    elif "matriz" in kind_text.lower():
        kind = CompanyKind.MATRIZ
    street_type = get_any(
        payload, "tipoLogradouro", "descricao_tipo_de_logradouro", default=""
    ).strip()
    street = get_any(payload, "logradouro", default="").strip()
    address_parts = [
        f"{street_type} {street}".strip()
        if street_type and street
        else street or street_type,
        get_any(payload, "logradouroNumero", "numero", default="").strip(),
        get_any(payload, "complemento", "enderecoComplemento", default="").strip(),
        get_any(payload, "bairro", "district", default="").strip(),
    ]
    address = ", ".join(part for part in address_parts if part)
    city = get_any(payload, "municipio", "cidade", "municipality", default="")
    state = get_any(payload, "uf", "estado", default="")
    zip_code = get_any(payload, "cep", "zipCode", default="")
    return CompanyLookupRead(
        cnpj=format_cnpj(cnpj),
        code=company_code(name or trade_name or "EMPRESA", cnpj),
        name=name or trade_name or "Empresa sem nome",
        trade_name=trade_name,
        kind=kind,
        group_name=trade_name or name or "Grupo da empresa",
        active="baixa" not in status.lower() and "inapta" not in status.lower(),
        status=status,
        opening_date=opening_date,
        address=address,
        city=city,
        state=state,
        zip_code=zip_code,
        source=source,
    )


def lookup_company_data(cnpj: str) -> CompanyLookupRead:
    public_providers = [
        ("BrasilAPI", f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"),
        ("Minha Receita", f"https://minhareceita.org/{cnpj}"),
        ("ReceitaWS", f"https://receitaws.com.br/v1/cnpj/{cnpj}"),
    ]
    for source, url in public_providers:
        try:
            payload = request_json(url)
            if isinstance(payload, dict):
                message = str(
                    payload.get("message")
                    or payload.get("erro")
                    or payload.get("status")
                    or ""
                )
                if message.upper() == "ERROR":
                    continue
                return build_company_lookup(payload, source, cnpj)
        except (
            HTTPError,
            URLError,
            TimeoutError,
            OSError,
            json.JSONDecodeError,
            ValueError,
        ):
            continue

    official_url = settings.cnpj_lookup_url.strip()
    official_token = settings.cnpj_lookup_bearer_token.strip()
    if official_url and official_token:
        try:
            url = official_url.rstrip("/")
            if "{cnpj}" in official_url:
                url = official_url.format(cnpj=cnpj)
            else:
                url = f"{url}/{cnpj}"
            headers = {"Accept": "application/json"}
            if official_token:
                headers["Authorization"] = f"Bearer {official_token}"
            payload = request_json(url, headers)
            if isinstance(payload, dict):
                return build_company_lookup(payload, "Receita Federal / Serpro", cnpj)
        except (
            HTTPError,
            URLError,
            TimeoutError,
            OSError,
            json.JSONDecodeError,
            ValueError,
        ):
            pass
    return CompanyLookupRead(
        cnpj=format_cnpj(cnpj),
        code=company_code("EMPRESA", cnpj),
        name="Empresa sem nome",
        trade_name="",
        kind=CompanyKind.OUTRA,
        group_name="",
        parent_company_id=None,
        active=True,
        status="",
        opening_date="",
        address="",
        city="",
        state="",
        zip_code="",
        source="Consulta de CNPJ indisponível no momento",
    )


@router.get("", response_model=list[CompanyRead])
def list_companies(db: DbSession, _: CurrentUser) -> list[Company]:
    return list(
        db.scalars(select(Company).order_by(Company.is_primary.desc(), Company.code))
    )


@router.get("/lookup", response_model=CompanyLookupRead)
def lookup_company(cnpj: str, _: CurrentUser) -> CompanyLookupRead:
    return lookup_company_data(normalize_cnpj(cnpj))


@router.post("", response_model=CompanyRead, status_code=201)
def create_company(payload: CompanyCreate, db: DbSession, _: AdminUser) -> Company:
    company_data = payload.model_dump()
    cnpj = company_data.get("cnpj")
    if cnpj:
        existing_cnpj = db.scalar(select(Company).where(Company.cnpj == cnpj))
        if existing_cnpj:
            raise HTTPException(status_code=409, detail="CNPJ já cadastrado")
    existing_code = db.scalar(
        select(Company).where(Company.code == company_data["code"])
    )
    if existing_code:
        raise HTTPException(status_code=409, detail="Código de empresa já existe")
    if not str(company_data.get("group_name", "")).strip():
        parent_id = company_data.get("parent_company_id")
        if parent_id:
            parent = db.get(Company, parent_id)
            company_data["group_name"] = (
                parent.group_name or parent.name if parent else company_data["name"]
            )
        else:
            company_data["group_name"] = company_data["name"]
    has_company = db.scalar(select(Company.id).limit(1)) is not None
    if not has_company:
        company_data["is_primary"] = True
    if company_data.get("is_primary"):
        company_data["active"] = True
    item = Company(**company_data)
    db.add(item)
    try:
        source_company = db.scalar(
            select(Company).order_by(Company.is_primary.desc(), Company.id)
        )
        db.flush()
        if item.is_primary:
            db.execute(
                update(Company).where(Company.id != item.id).values(is_primary=False)
            )
        db.add(
            SystemSetting(
                id=item.id,
                company_id=item.id,
                company_name=item.name,
                company_logo="",
                backup_directory="",
                auto_backup_on_start=True,
                include_saturdays=False,
                include_sundays=False,
                default_daily_hours=8.8,
                payroll_rates=DEFAULT_PAYROLL_RATES,
                job_titles=(
                    list(
                        db.scalar(
                            select(SystemSetting.job_titles).where(
                                SystemSetting.company_id == source_company.id
                            )
                        )
                        or DEFAULT_JOB_TITLES
                    )
                    if source_company
                    else DEFAULT_JOB_TITLES
                ),
            )
        )
        if source_company:
            for center in db.scalars(
                select(ResultCenter).where(ResultCenter.company_id == source_company.id)
            ):
                db.add(
                    ResultCenter(
                        company_id=item.id,
                        code=center.code,
                        name=center.name,
                        color=center.color,
                        active=center.active,
                    )
                )
            for employment_type in db.scalars(
                select(EmploymentType).where(
                    EmploymentType.company_id == source_company.id
                )
            ):
                db.add(
                    EmploymentType(
                        company_id=item.id,
                        name=employment_type.name,
                        has_charges=employment_type.has_charges,
                        active=employment_type.active,
                    )
                )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Código de empresa já existe"
        ) from None
    db.refresh(item)
    return item


@router.patch("/{company_id}", response_model=CompanyRead)
def update_company(
    company_id: int, payload: CompanyUpdate, db: DbSession, _: AdminUser
) -> Company:
    item = db.get(Company, company_id)
    if not item:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    company_data = payload.model_dump(exclude_unset=True)
    code = company_data.get("code")
    if code:
        existing_code = db.scalar(
            select(Company).where(Company.code == code, Company.id != company_id)
        )
        if existing_code:
            raise HTTPException(status_code=409, detail="Código de empresa já existe")

    cnpj = company_data.get("cnpj")
    if cnpj:
        existing_cnpj = db.scalar(
            select(Company).where(Company.cnpj == cnpj, Company.id != company_id)
        )
        if existing_cnpj:
            raise HTTPException(status_code=409, detail="CNPJ já cadastrado")

    if (
        "parent_company_id" in company_data
        and company_data["parent_company_id"] == company_id
    ):
        raise HTTPException(
            status_code=422, detail="A matriz pai não pode ser a própria empresa"
        )
    if company_data.get("is_primary"):
        company_data["active"] = True
    if item.is_primary and company_data.get("active") is False:
        raise HTTPException(
            status_code=422, detail="A empresa principal precisa estar ativa"
        )
    if item.is_primary and company_data.get("is_primary") is False:
        another_primary = db.scalar(
            select(Company).where(
                Company.id != company_id, Company.is_primary.is_(True)
            )
        )
        if not another_primary:
            raise HTTPException(
                status_code=422,
                detail="Escolha outra empresa como principal antes de remover esta marcação",
            )

    for field, value in company_data.items():
        setattr(item, field, value)
    if item.is_primary:
        db.execute(
            update(Company).where(Company.id != item.id).values(is_primary=False)
        )

    setting = db.scalar(
        select(SystemSetting).where(SystemSetting.company_id == company_id)
    )
    if setting and "name" in company_data:
        setting.company_name = item.name

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Código ou CNPJ já cadastrado"
        ) from None
    db.refresh(item)
    return item
