from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ManualInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class DossierInput(ManualInput):
    name: str = Field(min_length=1, max_length=180)
    reference: str = Field(default="", max_length=80)
    admission_date: date = Field(ge=date(1900, 1, 1), le=date(2100, 12, 31))
    notes: str = Field(default="", max_length=4000)


class DossierUpdate(DossierInput):
    revision: int = Field(ge=1)


class EventInput(ManualInput):
    revision: int = Field(ge=1)
    kind: Literal["VACATION", "LEAVE", "COLLECTIVE", "ABSENCE"]
    start_date: date = Field(ge=date(1900, 1, 1), le=date(2100, 12, 31))
    end_date: date = Field(ge=date(1900, 1, 1), le=date(2100, 12, 31))
    leave_type: str = Field(default="", max_length=120)
    effect: Literal["NONE", "SUSPEND", "RESTART", "LOSE"] = "NONE"
    sold_days: int = Field(default=0, ge=0, le=365)
    period_start: date | None = Field(
        default=None, ge=date(1900, 1, 1), le=date(2100, 12, 31)
    )
    notes: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def consistent_input(self):
        if self.end_date < self.start_date:
            raise ValueError("A data final não pode ser anterior à inicial.")
        if self.kind != "LEAVE" and self.effect != "NONE":
            raise ValueError("Informe efeito apenas para afastamentos.")
        if self.kind != "VACATION" and self.sold_days:
            raise ValueError(
                "Dias vendidos pertencem ao lançamento de férias individuais."
            )
        if self.kind == "VACATION" and not self.period_start:
            raise ValueError("Informe o período aquisitivo de referência.")
        return self
