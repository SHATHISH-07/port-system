from fastapi import HTTPException
_cache = {
    "history": None,
    "current": None,
    "heatmap": None,
    "model": None
}

def set_cache(key, df):
    _cache[key] = df

def get_cache(key):
    if _cache[key] is None:
        raise HTTPException(
            status_code=400,
            detail=f"No dataset uploaded for {key}"
        )
    return _cache[key]