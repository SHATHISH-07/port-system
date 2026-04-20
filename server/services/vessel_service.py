from utils.stay_utils import compute_vessel_stay
from models.stay_model import predict_vessel
from utils.data_loader import get_data


def analyze_vessel(vessel_service):

    df = get_data()

    actual = compute_vessel_stay(df, vessel_service)
    predicted = predict_vessel(df, vessel_service)

    return {
        "vessel": vessel_service,
        "actual": actual,
        "predicted": predicted
    }