# Utility function to classify the weight of the containers
def classify_weight(weight):
    try:
        # Convert weight to float
        w = float(weight)
        # Classify based on weight
        if w < 10000:
            return "Light"
        elif w < 25000:
            return "Medium"
        else:
            return "Heavy"
    except:
        return "Unknown"
