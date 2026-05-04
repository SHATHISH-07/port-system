import time

class TTLCache:
    def __init__(self, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self._cache = {}

    def get(self, key: str):
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["timestamp"] < self.ttl_seconds:
                return entry["value"]
            else:
                # Expired
                del self._cache[key]
        return None

    def set(self, key: str, value: any):
        self._cache[key] = {
            "value": value,
            "timestamp": time.time()
        }

    def clear(self):
        self._cache.clear()

    def remove(self, key: str):
        if key in self._cache:
            del self._cache[key]

# Global instances
vessel_cache = TTLCache(ttl_seconds=3600)  # 1 hour
