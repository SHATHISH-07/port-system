def classify_weight(weight):
    try:
        w = float(weight)
        if w < 10000:
            return "Light"
        elif w < 25000:
            return "Medium"
        else:
            return "Heavy"
    except:
        return "Unknown"
