import os

path = r'd:\port-system\server\models\stay_model.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """    if ml_pred < ABSOLUTE_MIN_HOURS or ml_pred > ABSOLUTE_MAX_HOURS:
        pred = heuristic  # model has failed; fall back entirely
        else:
            # Prevent extreme outliers by bounding ML to a realistic multiplier of the physics heuristic
            if historical_avg_stay_hours and historical_avg_stay_hours > 0:
                # Bug 2 fix: Widen multiplier to 0.3 to 3.0 so we don't hard clamp prematurely
                max_allowed = historical_avg_stay_hours * 3.0
                min_allowed = historical_avg_stay_hours * 0.3
            else:
                max_allowed = heuristic * 1.5
                min_allowed = heuristic * 0.5
                
            if ml_pred > max_allowed:
                pred = max_allowed
            elif ml_pred < min_allowed:
                pred = min_allowed
            else:
                pred = ml_pred

        final_pred = round(float(max(float(settings.TRAIN_MIN_HOURS), pred)), 2)"""

replacement = """    if ml_pred < ABSOLUTE_MIN_HOURS or ml_pred > ABSOLUTE_MAX_HOURS:
        pred = heuristic  # model has failed; fall back entirely
    else:
        # Prevent extreme outliers by bounding ML to a realistic multiplier of the physics heuristic
        if historical_avg_stay_hours and historical_avg_stay_hours > 0:
            # Bug 2 fix: Widen multiplier to 0.3 to 3.0 so we don't hard clamp prematurely
            max_allowed = historical_avg_stay_hours * 3.0
            min_allowed = historical_avg_stay_hours * 0.3
        else:
            max_allowed = heuristic * 1.5
            min_allowed = heuristic * 0.5
            
        if ml_pred > max_allowed:
            pred = max_allowed
        elif ml_pred < min_allowed:
            pred = min_allowed
        else:
            pred = ml_pred

    final_pred = round(float(max(float(settings.TRAIN_MIN_HOURS), pred)), 2)"""

if target in content:
    content = content.replace(target, replacement)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed!")
else:
    print("Not found!")
