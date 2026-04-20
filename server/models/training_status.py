class TrainingStatus:
    def __init__(self):
        self.data = {
            "status": "idle",   # idle | training | completed | failed
            "message": ""
        }

    def set(self, status, message=""):
        self.data["status"] = status
        self.data["message"] = message

    def get(self):
        return self.data


training_status = TrainingStatus()