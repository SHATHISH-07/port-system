from fastapi import HTTPException

# In-memory cache for API results
_cache = {
    "history": None,
    "current": None,
    "heatmap": None,
    "model": None
}

# Utility function to set the cache
def set_cache(key, df):
    _cache[key] = df

# Utility function to get the cache
def get_cache(key):
    if _cache[key] is None:
        raise HTTPException(
            status_code=400,
            detail=f"No dataset uploaded for {key}"
        )
    return _cache[key]