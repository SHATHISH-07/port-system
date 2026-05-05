import threading

# Default training configuration
DEFAULT_CONFIG = {
    "min_hours": 2,
    "max_hours": 240,
    "min_visit_rows": 5,
}

# Stay time model training status
class TrainingStatus:
    def __init__(self):
        self._lock = threading.Lock()
        # Initialize training status
        self.data = {
            "status": "idle",
            "message": "",
            "records_count": 0,
            "data_source": "",
            "training_type": "",
            "last_config": DEFAULT_CONFIG.copy(),
        }

    def set(self, status, message="", records_count=0, data_source="", training_type="", config=None):
        with self._lock:
            self.data["status"] = status
            self.data["message"] = message
            if records_count:
                self.data["records_count"] = records_count
            if data_source:
                self.data["data_source"] = data_source
            if training_type:
                self.data["training_type"] = training_type
            if config:
                self.data["last_config"] = config

    def get(self):
        with self._lock:
            return dict(self.data)

    def get_last_config(self) -> dict:
        with self._lock:
            return dict(self.data.get("last_config", DEFAULT_CONFIG))


# Singleton instance
training_status = TrainingStatus()