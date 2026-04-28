import re
from utils.data_loader import get_data

# Constants
VISIT_WINDOW_HOURS = 96

# Regex for extracting block ID
BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d+)')

# Get all blocks
def get_all_blocks():
    # Load dataset
    df = get_data()
    
    # Initialize set for blocks
    blocks = set()
    
    # Iterate over container positions
    for pos in df["Ctr From Position"].dropna():

        pos = str(pos)

        # Skip if not starting with Y
        if not pos.startswith("Y-"):
            continue

        # Search for block ID
        match = BLOCK_REGEX.search(pos)

        if match:
            blocks.add(match.group(1))

    return sorted(blocks)