from typing import Any, Iterable, Optional
from fastapi import Request

from utils.file_parser import (
    extract_container_ids_from_file,
    extract_container_ids_from_text,
)

def clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    return text

def merge_unique(existing: list[str], new_items: Iterable[str]) -> list[str]:
    seen = set(existing)
    merged = list(existing)
    for item in new_items:
        item = clean_text(item)
        if item and item not in seen:
            seen.add(item)
            merged.append(item)
    return merged

def coerce_container_ids(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if isinstance(item, str):
                out = merge_unique(out, extract_container_ids_from_text(item))
            else:
                out = merge_unique(out, [str(item).strip()])
        return out
    if isinstance(value, str):
        return extract_container_ids_from_text(value)
    return [str(value).strip()] if str(value).strip() else []

async def parse_upload_request(request: Request) -> dict:
    """Helper to parse application/json or multipart/form-data for endpoints taking container files."""
    content_type = request.headers.get("content-type", "").lower()
    vessel_id = None
    yard_id = None
    visit_id = None
    container_ids: list[str] = []
    filename = None

    if "application/json" in content_type:
        body = await request.json()
        vessel_id = clean_text(body.get("vesselId"))
        yard_id = clean_text(body.get("yardId"))
        visit_id = clean_text(body.get("visitId"))
        container_ids = coerce_container_ids(body.get("containerIds"))
    else:
        form = await request.form()
        vessel_id = clean_text(form.get("vesselId"))
        yard_id = clean_text(form.get("yardId"))
        visit_id = clean_text(form.get("visitId"))

        if "containerIds" in form:
            container_ids = coerce_container_ids(form.get("containerIds"))

        upload = form.get("file")
        if upload is not None and getattr(upload, "filename", None):
            filename = upload.filename
            content = await upload.read()
            # ValueError handled by the route wrapper
            file_ids = extract_container_ids_from_file(content, upload.filename)
            container_ids = merge_unique(container_ids, file_ids)

    return {
        "vessel_id": vessel_id,
        "yard_id": yard_id,
        "visit_id": visit_id,
        "container_ids": container_ids,
        "filename": filename,
    }