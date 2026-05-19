import json
import logging
from io import BytesIO
from typing import Any

import pandas as pd

logger = logging.getLogger("port_system")


def extract_container_ids_from_text(raw_text: str) -> list[str]:
    """
    Parse container IDs from:
    - JSON list
    - JSON object with common keys
    - comma/newline separated text
    """
    if not raw_text:
        return []

    text = raw_text.strip()

    try:
        data = json.loads(text)
        if isinstance(data, list):
            return list(dict.fromkeys([str(item).strip() for item in data if item]))
        if isinstance(data, dict):
            for k in ["containerIds", "container_ids", "unit_ids", "units"]:
                if k in data and isinstance(data[k], list):
                    return list(dict.fromkeys([str(item).strip() for item in data[k] if item]))
    except Exception:
        pass

    candidates = []
    for line in text.replace(",", "\n").splitlines():
        token = str(line).strip()
        if token:
            candidates.append(token)

    return list(dict.fromkeys(candidates))


def extract_container_ids_from_file(file_bytes: bytes, filename: str) -> list[str]:
    """
    Parse JSON, CSV, or Excel file and extract container IDs.
    """
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    container_ids = []

    try:
        if ext == "json":
            data = json.loads(file_bytes.decode("utf-8"))
            if isinstance(data, list):
                container_ids = [str(item).strip() for item in data if item]
            elif isinstance(data, dict):
                for k in ["containerIds", "container_ids", "unit_ids", "units"]:
                    if k in data and isinstance(data[k], list):
                        container_ids = [str(item).strip() for item in data[k] if item]
                        break

        elif ext == "csv":
            df = pd.read_csv(BytesIO(file_bytes))
            container_ids = _extract_from_dataframe(df)

        elif ext in ("xls", "xlsx"):
            df = pd.read_excel(BytesIO(file_bytes))
            container_ids = _extract_from_dataframe(df)
            
        elif ext == "txt":
            container_ids = extract_container_ids_from_text(file_bytes.decode("utf-8"))
        else:
            logger.warning("Unsupported file format for container parsing: %s", ext)
            raise ValueError(f"Unsupported file format: {ext}")

    except Exception as e:
        logger.error("Error parsing uploaded file %s: %s", filename, e)
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Failed to parse file: {str(e)}")

    return list(dict.fromkeys([x for x in container_ids if x]))


def _extract_from_dataframe(df: pd.DataFrame) -> list[str]:
    col_names = [str(c).lower().strip() for c in df.columns]
    target_col = None

    for possible in ["unit_id", "unit id", "container_id", "container id", "unit", "container"]:
        if possible in col_names:
            idx = col_names.index(possible)
            target_col = df.columns[idx]
            break

    if target_col and target_col in df.columns:
        return [str(val).strip() for val in df[target_col].dropna().tolist()]

    if len(df.columns) > 0:
        return [str(val).strip() for val in df.iloc[:, 0].dropna().tolist()]

    return []