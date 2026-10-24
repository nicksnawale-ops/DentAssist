"""Pydantic schemas. All API JSON uses camelCase to match the React app's types.ts."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

Role = Literal["super_admin", "admin", "dentist", "receptionist", "patient"]
StaffRole = Literal["admin", "dentist", "receptionist"]
StaffStatus = Literal["active", "on_leave", "inactive"]
ClinicStatus = Literal["active", "inactive"]
AppointmentStatus = Literal["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]
WaitlistStatus = Literal["waiting", "scheduled", "cancelled"]


def _utc(dt: datetime) -> datetime:
    from datetime import timezone

    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Shared value objects ----------

class Address(CamelModel):
    street: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    country: str = "India"


class OperatingHours(CamelModel):
    day: str
    is_open: bool
    open_time: str
    close_time: str


class WorkingHours(CamelModel):
    day: str
    is_working: bool
    start_time: str
    end_time: str


class Page(CamelModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


# ---------- Auth ----------

class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(CamelModel):
    refresh_token: str


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class UserOut(CamelModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: Role
    clinic_id: str | None = None
    clinic_ids: list[str] | None = None
    patient_id: str | None = None
    avatar_url: str | None = None
    phone: str | None = None
    created_at: datetime
    status: StaffStatus | None = None
    date_joined: datetime | None = None
    specializations: list[str] | None = None
    license_number: str | None = None
    working_hours: list[WorkingHours] | None = None


class TokenResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ---------- Clinics ----------

class ClinicBase(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: Address | None = None
    phone: str | None = None
    email: EmailStr | None = None
    timezone: str | None = None
    operating_hours: list[OperatingHours] | None = None
    logo_url: str | None = None
    status: ClinicStatus | None = None


class ClinicCreate(ClinicBase):
    name: str = Field(min_length=1, max_length=200)


class ClinicUpdate(ClinicBase):
    pass


class ClinicOut(CamelModel):
    id: str
    name: str
    address: Address | None = None
    phone: str | None = None
    email: str | None = None
    timezone: str | None = None
    operating_hours: list[OperatingHours] | None = None
    logo_url: str | None = None
    status: ClinicStatus
    created_at: datetime
    # Live aggregates
    active_staff_count: int = 0
    active_patients_count: int = 0
    monthly_revenue: float = 0


# ---------- Staff ----------

class StaffBase(CamelModel):
    email: EmailStr | None = None
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    role: StaffRole | None = None
    clinic_id: str | None = None
    clinic_ids: list[str] | None = None
    phone: str | None = None
    avatar_url: str | None = None
    status: StaffStatus | None = None
    date_joined: datetime | None = None
    specializations: list[str] | None = None
    license_number: str | None = None
    working_hours: list[WorkingHours] | None = None


class StaffCreate(StaffBase):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    role: StaffRole
    # Optional: if omitted a temporary password is generated and returned once.
    password: str | None = Field(default=None, min_length=8, max_length=200)


class StaffUpdate(StaffBase):
    pass


class StaffCreated(UserOut):
    temporary_password: str | None = None


class PasswordResetOut(CamelModel):
    temporary_password: str


# ---------- Patients ----------

class CommunicationPrefs(CamelModel):
    whatsapp_opt_in: bool = False
    language: str = "English"


class EmergencyContact(CamelModel):
    name: str = ""
    relationship: str = ""
    phone: str = ""


class MedicalHistory(CamelModel):
    allergies: list[str] = []
    medications: list[str] = []
    chronic_conditions: list[str] = []
    past_surgeries: str = ""


class DentalHistory(CamelModel):
    reason_for_visit: str = ""
    last_dental_visit: str = ""
    ongoing_issues: str = ""
    smoking_tobacco_use: bool = False


class Insurance(CamelModel):
    provider: str = ""
    policy_number: str = ""
    notes: str = ""


class PatientBase(CamelModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, min_length=5, max_length=40)
    email: EmailStr | None = None
    dob: str | None = None
    gender: str | None = None
    address: str | Address | None = None
    clinic_id: str | None = None
    communication_prefs: CommunicationPrefs | None = None
    emergency_contact: EmergencyContact | None = None
    medical_history: MedicalHistory | None = None
    dental_history: DentalHistory | None = None
    insurance: Insurance | None = None
    referral_source: str | None = None
    tags: list[str] | None = None

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, v):
        return None if v == "" else v

    @field_validator("dob")
    @classmethod
    def _dob_format(cls, v):
        if v in (None, ""):
            return None
        try:
            datetime.strptime(v[:10], "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("dob must be YYYY-MM-DD") from exc
        return v[:10]


class PatientCreate(PatientBase):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    phone: str = Field(min_length=5, max_length=40)


class PatientUpdate(PatientBase):
    pass


class PatientOut(CamelModel):
    id: str
    clinic_id: str | None = None
    first_name: str
    last_name: str
    phone: str
    email: str | None = None
    dob: str | None = None
    gender: str | None = None
    address: str | Address | None = None
    communication_prefs: CommunicationPrefs | None = None
    emergency_contact: EmergencyContact | None = None
    medical_history: MedicalHistory | None = None
    dental_history: DentalHistory | None = None
    insurance: Insurance | None = None
    referral_source: str | None = None
    tags: list[str] = []
    last_visit: str | None = None
    next_appointment: datetime | None = None
    outstanding_balance: float = 0
    edit_request: dict | None = None
    created_at: datetime | None = None


class DuplicateCheckOut(CamelModel):
    is_duplicate: bool
    matches: list[PatientOut]


# ---------- Appointments ----------

class AppointmentBase(CamelModel):
    patient_id: str | None = None
    dentist_id: str | None = None
    clinic_id: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: AppointmentStatus | None = None
    procedure_type: str | None = Field(default=None, min_length=1, max_length=100)
    notes: str | None = None

    @model_validator(mode="after")
    def _times_ordered(self):
        if self.start_time and self.end_time and _utc(self.end_time) <= _utc(self.start_time):
            raise ValueError("endTime must be after startTime")
        return self


class AppointmentCreate(AppointmentBase):
    patient_id: str
    dentist_id: str
    clinic_id: str
    start_time: datetime
    end_time: datetime
    procedure_type: str = Field(min_length=1, max_length=100)
    # Set true to book even if the dentist already has an overlapping appointment.
    allow_overlap: bool = False


class AppointmentUpdate(AppointmentBase):
    allow_overlap: bool = False


class CancelRequest(CamelModel):
    reason: str | None = None


class AppointmentOut(CamelModel):
    id: str
    patient_id: str
    dentist_id: str
    clinic_id: str
    start_time: datetime
    end_time: datetime
    status: AppointmentStatus
    procedure_type: str
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PortalBookRequest(CamelModel):
    dentist_id: str
    clinic_id: str
    start_time: datetime
    end_time: datetime
    procedure_type: str = Field(min_length=1, max_length=100)
    notes: str | None = None


class PortalRescheduleRequest(CamelModel):
    start_time: datetime
    end_time: datetime


# ---------- Waitlist ----------

class WaitlistCreate(CamelModel):
    patient_id: str
    clinic_id: str
    preferred_dentist_id: str | None = None
    preferred_date_range: str = ""


class WaitlistOut(CamelModel):
    id: str
    patient_id: str
    preferred_dentist_id: str | None = None
    preferred_date_range: str
    clinic_id: str
    status: WaitlistStatus
    created_at: datetime


# ---------- Notifications & settings ----------

class NotificationOut(CamelModel):
    id: str
    title: str
    message: str
    is_read: bool
    created_at: datetime


class AuditLogOut(CamelModel):
    id: str
    actor_user_id: str | None
    action: str
    entity_type: str
    entity_id: str
    before_state: dict | None = None
    after_state: dict | None = None
    timestamp: datetime


def money(value: Decimal | float | int | None) -> float:
    return float(value or 0)


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True)
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def column_values(model: BaseModel, exclude: set[str] | None = None) -> dict[str, Any]:
    """Fields the client actually sent, keyed by snake_case column name.

    Nested objects are stored in camelCase JSON (the same shape the frontend
    sends and receives), so JSON columns look identical whether rows came from
    the API or the seed script.
    """
    exclude = exclude or set()
    return {k: _jsonable(getattr(model, k)) for k in model.model_fields_set if k not in exclude}
