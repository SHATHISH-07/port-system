import threading
from config import settings

# ─── In-memory dynamic retraining config ─────────────────────────────────────
# Can be updated at runtime via PATCH /config/retraining without server restart.

class RetrainingConfig:
    def __init__(self):
        self._lock = threading.Lock()
        self._data = {
            "retrain_threshold":       settings.RETRAIN_THRESHOLD_NEW_RECORDS,
            "scheduled_hour":          2,    # 2 AM — requires scheduler restart to change
            "scheduled_minute":        0,
        }

    def get(self) -> dict:
        with self._lock:
            return dict(self._data)

    def update(self, threshold: int = None) -> dict:
        with self._lock:
            if threshold is not None and threshold > 0:
                self._data["retrain_threshold"] = threshold
            return dict(self._data)

    @property
    def threshold(self) -> int:
        with self._lock:
            return self._data["retrain_threshold"]


# Singleton
retraining_config = RetrainingConfig()
