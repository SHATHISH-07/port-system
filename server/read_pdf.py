import PyPDF2
import os

pdf_path = os.path.join(os.path.dirname(__file__), "data", "Deck Optimiser new Features  1.pdf")
with open(pdf_path, 'rb') as file:
    reader = PyPDF2.PdfReader(file)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"

import sys
sys.stdout.reconfigure(encoding='utf-8')
print(text)
