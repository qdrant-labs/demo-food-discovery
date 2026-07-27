import os
import unicodedata

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)

dotenv_path = os.path.join(ROOT_DIR, ".env")

if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)


# Common Cyrillic/Greek look-alikes (homoglyphs) that copy-paste sometimes
# substitutes into an API key. The key goes into an HTTP header (ASCII only), so
# repair look-alikes and drop anything still non-ASCII to avoid a startup crash.
_HOMOGLYPHS = {
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "і": "i", "ј": "j", "ѕ": "s",
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}
_HOMOGLYPH_TABLE = str.maketrans(_HOMOGLYPHS)


def _sanitize_key(raw):
    if not raw:
        return raw
    k = unicodedata.normalize("NFKC", raw.strip()).translate(_HOMOGLYPH_TABLE)
    return k.encode("ascii", "ignore").decode()


# Qdrant configuration
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333").strip()
QDRANT_API_KEY = _sanitize_key(os.environ.get("QDRANT_API_KEY", None))
QDRANT_COLLECTION = os.environ.get("QDRANT_COLLECTION", "wolt-clip-ViT-B-32")

# Search configuration
MAX_SEARCH_LIMIT = 100
DEFAULT_LIMIT = 12
GROUP_BY_FIELD = "cafe.slug"
