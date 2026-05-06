import re

# Constants
VISIT_WINDOW_HOURS = 96

# Regex for extracting block ID
BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d+)')

# Get all blocks from a given dataframe
def get_all_blocks(df):
    # Initialize set for blocks
    blocks = set()

    # Iterate over container positions
    for pos in df["ctr_from_position"].dropna():
        pos = str(pos)

        # Skip if not starting with Y
        if not pos.startswith("Y-"):
            continue

        # Search for block ID
        match = BLOCK_REGEX.search(pos)

        if match:
            blocks.add(match.group(1))

    return sorted(blocks)