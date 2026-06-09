def safe_divide(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def absenteeism(non_productive_hours: float, scheduled_hours: float) -> float:
    return safe_divide(non_productive_hours, scheduled_hours)


def turnover(admissions: int, terminations: int, average_headcount: float) -> float:
    return safe_divide((admissions + terminations) / 2, average_headcount)


def excel_number(value: object) -> float:
    """Normaliza números importados; erros comuns do Excel viram zero."""
    excel_errors = {"#REF!", "#DIV/0!", "#NAME?", "#VALUE!", "#N/A"}
    if value is None or (isinstance(value, str) and value.strip().upper() in excel_errors):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def calculate_unconfirmed_labor_provision(*_: object) -> float:
    # TODO: validar a regra trabalhista e suas bases antes de implementar este cálculo.
    return 0.0

