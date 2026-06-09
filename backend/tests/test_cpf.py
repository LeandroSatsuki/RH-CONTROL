from app.schemas.employee import is_valid_cpf, normalize_cpf


def test_normalize_and_validate_cpf() -> None:
    assert normalize_cpf("529.982.247-25") == "52998224725"
    assert is_valid_cpf("529.982.247-25")


def test_reject_invalid_cpf() -> None:
    assert not is_valid_cpf("111.111.111-11")
    assert not is_valid_cpf("123")
