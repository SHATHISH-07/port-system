import re

# Constants
VISIT_WINDOW_HOURS = 96

# Regex for extracting block ID
BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d+)')