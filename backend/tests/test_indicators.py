from app.services.indicators import absenteeism, excel_number, safe_divide, turnover


def test_zero_denominator_returns_zero() -> None:
    assert safe_divide(10, 0) == 0
    assert absenteeism(8, 0) == 0
    assert turnover(2, 1, 0) == 0


def test_indicator_formulas() -> None:
    assert absenteeism(8, 160) == 0.05
    assert turnover(2, 1, 10) == 0.15


def test_excel_errors_become_zero() -> None:
    for value in ("#REF!", "#DIV/0!", "#NAME?", "#VALUE!", "#N/A", None, "texto"):
        assert excel_number(value) == 0
    assert excel_number("12.5") == 12.5

