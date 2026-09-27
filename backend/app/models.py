from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    phone: Optional[str] = None
    full_name: str = ""
    company: Optional[str] = None
    role: str = "maker"  # maker | hub | admin
    password_hash: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Hub(SQLModel, table=True):
    """A verified production partner (printer owner / workshop)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name_fa: str
    name_en: str
    city_fa: str
    city_en: str
    lat: float
    lng: float
    technologies: str = "FDM"        # comma separated: FDM,SLA,SLS
    materials: str = "pla,abs"       # comma separated material slugs
    rating: float = 4.8
    reviews_count: int = 0
    orders_done: int = 0
    lead_time_days: int = 3
    max_build_mm: int = 250
    capacity_pct: int = 60           # current utilisation
    hourly_rate: int = 45_000        # Toman / machine-hour
    verified: bool = True
    pro: bool = False
    bio_fa: str = ""
    bio_en: str = ""


class Material(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    name_fa: str
    name_en: str
    technology: str = "FDM"
    density: float = 1.24            # g/cm3
    price_per_cm3: int = 12_000      # Toman
    color_hex: str = "#6EE7B7"
    min_wall_mm: float = 0.8
    desc_fa: str = ""
    desc_en: str = ""


class Quote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    filename: str = ""
    volume_cm3: float = 0
    bbox_x: float = 0
    bbox_y: float = 0
    bbox_z: float = 0
    triangles: int = 0
    material_slug: str = "pla"
    technology: str = "FDM"
    quality: str = "standard"        # draft | standard | fine
    infill: int = 20
    quantity: int = 1
    city: str = "tehran"
    unit_price: int = 0
    total_price: int = 0
    lead_time_days: int = 3
    print_hours: float = 0
    warnings: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(index=True)
    user_id: int = Field(foreign_key="user.id")
    quote_id: int = Field(foreign_key="quote.id")
    hub_id: Optional[int] = Field(default=None, foreign_key="hub.id")
    status: str = "pending_payment"
    address: str = ""
    note: str = ""
    amount: int = 0
    commission: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Review(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hub_id: int = Field(foreign_key="hub.id")
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    author: str = ""
    rating: int = 5
    body: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
