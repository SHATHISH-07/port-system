# Stay time model training status
class TrainingStatus:
    def __init__(self):
        # Initialize training status
        self.data = {
            "status": "idle",
            "message": ""
        }

    # Set training status
    def set(self, status, message=""):
        self.data["status"] = status
        self.data["message"] = message

    # Get training status
    def get(self):
        return self.data


# Create training status instance
training_status = TrainingStatus()