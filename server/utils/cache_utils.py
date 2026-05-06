import time

# Simple TTL cache implementation for vessel data
class TTLCache:
    # Initialize cache with a default TTL of 1 hour
    def __init__(self, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self._cache = {}
    
    # Get cached data
    def get(self, key: str):
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["timestamp"] < self.ttl_seconds:
                return entry["value"]
            else:
                # Expired
                del self._cache[key]
        return None
    # Add data to cache
    def set(self, key: str, value: any):
        self._cache[key] = {
            "value": value,
            "timestamp": time.time()
        }
    
    # Clear cache
    def clear(self):
        self._cache.clear()
    
    # Remove data from cache
    def remove(self, key: str):
        if key in self._cache:
            del self._cache[key]

# Global instances
vessel_cache = TTLCache(ttl_seconds=3600)  # 1 hour
