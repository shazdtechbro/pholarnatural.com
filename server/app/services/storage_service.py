from abc import ABC, abstractmethod
from typing import Any
import cloudinary
import cloudinary.uploader
from app.core.config import settings


class StorageService(ABC):
    @abstractmethod
    def upload_image(self, file_object: Any, folder: str = "products") -> str:
        """Uploads an image and returns the public URL."""
        pass

    @abstractmethod
    def delete_image(self, public_id: str) -> bool:
        """Deletes an image by its public ID (or URL)."""
        pass


class CloudinaryStorageService(StorageService):
    def __init__(self):
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )

    def upload_image(self, file_object: Any, folder: str = "products") -> str:
        from fastapi import HTTPException

        data = (
            file_object.read(5_000_001) if hasattr(file_object, "read") else file_object
        )
        if not isinstance(data, bytes) or len(data) > 5_000_000:
            raise HTTPException(413, "Image must be at most 5 MB.")
        if not (
            data.startswith(b"\xff\xd8\xff")
            or data.startswith(b"\x89PNG\r\n\x1a\n")
            or (data.startswith(b"RIFF") and data[8:12] == b"WEBP")
        ):
            raise HTTPException(422, "Upload a JPEG, PNG or WebP image.")
        file_object = data
        # We read the raw bytes from the FastAPI UploadFile
        response = cloudinary.uploader.upload(
            file_object,
            folder=f"hair_platform/{folder}",
            resource_type="image",
            format="webp",
            transformation=[{"width": 2400, "height": 2400, "crop": "limit"}],
        )
        return response.get("secure_url")

    def delete_image(self, public_url: str) -> bool:
        try:
            # Extract public_id from Cloudinary URL
            # e.g., https://res.cloudinary.com/demo/image/upload/v12345/hair_platform/products/abcde.jpg
            # Public ID is typically: hair_platform/products/abcde
            parts = public_url.split("/")
            # Find the index of 'upload', then the version (v12345), and take the rest
            upload_idx = parts.index("upload")
            public_id_with_ext = "/".join(parts[upload_idx + 2 :])
            public_id = public_id_with_ext.rsplit(".", 1)[0]

            cloudinary.uploader.destroy(public_id)
            return True
        except Exception:
            return False
