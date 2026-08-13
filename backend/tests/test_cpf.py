from app.schemas.employee import is_valid_cnpj, is_valid_cpf, is_valid_cpf_cnpj, normalize_cpf


def test_normalize_and_validate_cpf() -> None:
    assert normalize_cpf("529.982.247-25") == "52998224725"
    assert is_valid_cpf("529.982.247-25")


def test_reject_invalid_cpf() -> None:
    assert not is_valid_cpf("111.111.111-11")
    assert not is_valid_cpf("123")


def test_validate_cpf_or_cnpj() -> None:
    assert is_valid_cpf_cnpj("529.982.247-25")
    assert is_valid_cpf_cnpj("11.222.333/0001-81")
    assert is_valid_cnpj("11.222.333/0001-81")
    assert not is_valid_cpf_cnpj("11.222.333/0001-80")
    assert not is_valid_cpf_cnpj("123456789")
