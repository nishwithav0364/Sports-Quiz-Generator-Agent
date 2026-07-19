import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environmental variables from .env if present
load_dotenv()

# System paths
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
CHROMA_DB_DIR = ROOT_DIR / "chroma_db"
FACTS_FILE = DATA_DIR / "sports_facts.json"

# API Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def validate_config():
    """Validates that the required configurations and directories are present."""
    # Ensure directories exist
    DATA_DIR.mkdir(exist_ok=True, parents=True)
    CHROMA_DB_DIR.mkdir(exist_ok=True, parents=True)
    
    # Check for GEMINI API key
    if not GEMINI_API_KEY:
        print("[WARNING] GEMINI_API_KEY not found in environment. The generator module will require this key.")
        return False
    return True
