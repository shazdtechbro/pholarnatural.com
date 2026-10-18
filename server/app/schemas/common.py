from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

Name = Annotated[str, Field(min_length=1, max_length=255)]
Money = Annotated[int, Field(strict=True, ge=0, le=10_000_000)]


class InputModel(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True, extra="forbid", hide_input_in_errors=True
    )

    @model_validator(mode="after")
    def reject_null_required_fields(self):
        required = {
            "name",
            "slug",
            "price_cents",
            "stock_count",
            "duration_minutes",
            "is_active",
            "discount_type",
            "value",
            "code",
        }
        for field in self.model_fields_set & required:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

    @field_validator("image_url", check_fields=False)
    @classmethod
    def safe_image_url(cls, value):
        if not value:
            return value
        from urllib.parse import urlparse

        if len(value) > 500:
            raise ValueError("Image URL is too long.")
        if value.startswith("/images/") and ".." not in value:
            return value
        parsed = urlparse(value)
        if (
            parsed.scheme != "https"
            or parsed.hostname != "res.cloudinary.com"
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            raise ValueError(
                "Use a local /images path or a Cloudinary HTTPS image URL."
            )
        return value
