"""Bounded request models. Every field that reaches pricing, storage or a query has a
type, a range or a length, so bad input is rejected with 422 before any work happens."""
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

Quality = Literal["draft", "standard", "fine"]
City = Literal["tehran", "karaj", "isfahan", "mashhad", "shiraz", "tabriz", "other"]
Slug = Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[a-z0-9-]+$")]
Email = Annotated[EmailStr, Field(max_length=254), AfterValidator(str.lower)]
Dim = Annotated[float, Field(ge=0, le=10_000, allow_inf_nan=False)]  # mm


class QuoteParams(BaseModel):
    material_slug: Slug = "pla"
    quality: Quality = "standard"
    infill: int = Field(20, ge=5, le=100)
    quantity: int = Field(1, ge=1, le=10_000)
    city: City = "tehran"


class ManualIn(QuoteParams):
    volume_cm3: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    bbox: Annotated[list[Dim], Field(min_length=3, max_length=3)] = [60, 60, 60]
    filename: str = Field("manual-entry", max_length=120)


class RegisterIn(BaseModel):
    email: Email
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field("", max_length=120)
    phone: str | None = Field(None, max_length=32)
    company: str | None = Field(None, max_length=120)

    @field_validator("password")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("password must not be blank")
        return v


class LoginIn(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class OrderIn(BaseModel):
    quote_public_id: str = Field(min_length=10, max_length=2000)  # the signed quote token
    hub_id: int | None = Field(None, ge=1, le=2**31 - 1)
    address: str = Field(min_length=5, max_length=500)
    note: str = Field("", max_length=1000)


class ReviewIn(BaseModel):
    order_public_id: str = Field(min_length=4, max_length=40)
    rating: int = Field(5, ge=1, le=5)
    body: str = Field("", max_length=1000)
