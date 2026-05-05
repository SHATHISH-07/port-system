# Stay time model training status
class TrainingStatus:
    def __init__(self):
        # Initialize training status
        self.data = {
            "status": "idle",
            "message": "",
            "records_count": 0,
            "data_source": "",
            "training_type": ""
        }

    # Set training status
    def set(self, status, message="", records_count=0, data_source="", training_type=""):
        self.data["status"] = status
        self.data["message"] = message
        if records_count: self.data["records_count"] = records_count
        if data_source: self.data["data_source"] = data_source
        if training_type: self.data["training_type"] = training_type

    # Get training status
    def get(self):
        return self.data


# Create training status instance
training_status = TrainingStatus()