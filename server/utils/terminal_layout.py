import re
from utils.data_loader import get_data

BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d+)')

def get_all_blocks():

    df = get_data()

    blocks = set()

    for pos in df["Ctr From Position"].dropna():

        pos = str(pos)

        if not pos.startswith("Y-"):
            continue

        match = BLOCK_REGEX.search(pos)

        if match:
            blocks.add(match.group(1))

    return sorted(blocks)