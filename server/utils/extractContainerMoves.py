from collections import defaultdict

# Extract container moves from the dataset
def extract_container_moves(df):
    # Initialize a dictionary to store move counts
    move_counts = defaultdict(int)

    # Iterate over each row in the dataset
    for _, row in df.iterrows():
        unit = row.get("Unit ID")
        from_pos = str(row.get("Ctr From Position", "")).strip()
        to_pos = str(row.get("Ctr To Position", "")).strip()

        if unit and from_pos and to_pos and from_pos != to_pos:
            move_counts[unit] += 1

    return move_counts