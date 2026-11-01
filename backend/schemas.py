from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


HazardType = Literal[
    "person_fallen", "fire_smoke", "stove_unattended", "water_leak", "intruder"
]
Severity = Literal["critical", "high", "medium"]


class Analysis(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    hazard_detected: bool
    hazard_type: HazardType | None
    severity: Severity | None
    description: str = Field(min_length=1, max_length=600)

    @model_validator(mode="after")
    def consistent_hazard(self):
        if self.hazard_detected:
            if self.hazard_type is None or self.severity is None:
                raise ValueError("Hazards require a type and severity.")
        elif self.hazard_type is not None or self.severity is not None:
            raise ValueError("Clear detections must have null type and severity.")
        else:
            self.description = "No hazards detected."
        if not self.description.strip():
            raise ValueError("Description must not be empty.")
        return self


class Detection(Analysis):
    timestamp: str


class Contact(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    name: str = Field(max_length=200)
    relation: str = Field(max_length=200)
    phone: str = Field(max_length=100)


class Profile(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    owner_name: str = Field(max_length=200)
    owner_phone: str = Field(max_length=100)
    address: str = Field(max_length=1000)
    gate_code: str = Field(max_length=100)
    contacts: list[Contact] = Field(max_length=20)
