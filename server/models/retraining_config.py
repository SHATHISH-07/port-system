import threading
from config import settings

class RetrainingConfig:
    """
    Thread-safe class to store and manage the configuration for automated model retraining.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._data = {
            "retrain_threshold":       settings.RETRAIN_THRESHOLD_NEW_RECORDS,
            "scheduled_hour":          2,    # 2 AM — requires scheduler restart to change
            "scheduled_minute":        0,
        }
    
    def get(self) -> dict:
        """
        Returns a dictionary copy of the current retraining configuration.
        """
        with self._lock:
            return dict(self._data)
    
    def update(self, threshold: int = None) -> dict:
        """
        Updates the retraining threshold and returns the new configuration.
        """
        with self._lock:
            if threshold is not None and threshold > 0:
                self._data["retrain_threshold"] = threshold
            return dict(self._data)

    @property
    def threshold(self) -> int:
        """
        Property to retrieve just the integer threshold value.
        """
        with self._lock:
            return self._data["retrain_threshold"]

# Singleton
retraining_config = RetrainingConfig()
