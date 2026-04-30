from collections import defaultdict

# Extract container moves from the dataset
def extract_container_moves(df):
    if df.empty or "unit_id" not in df.columns:
        return {}

    # Ensure columns exist to avoid KeyError
    from_col = "ctr_from_position"
    to_col = "ctr_to_position"
    if from_col not in df.columns or to_col not in df.columns:
        return {}

    # Convert to string and strip
    from_pos = df[from_col].astype(str).str.strip()
    to_pos = df[to_col].astype(str).str.strip()

    # Create boolean mask
    mask = (
        df["unit_id"].notna() &
        (from_pos != "") &
        (from_pos != "nan") &
        (to_pos != "") &
        (to_pos != "nan") &
        (from_pos != to_pos)
    )

    # Group by Unit ID and count
    counts = df[mask].groupby("unit_id").size().to_dict()
    
    # Convert to defaultdict to maintain the same return type
    from collections import defaultdict
    move_counts = defaultdict(int, counts)
    return move_counts