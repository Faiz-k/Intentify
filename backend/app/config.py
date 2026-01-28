import os
import json
import tempfile
from dotenv import load_dotenv

# Load .env file if it exists (won't overwrite existing env vars from docker-compose)
load_dotenv(override=False)

def get_google_credentials():
    """
    Create Google service account credentials from environment variables
    Returns path to temporary credentials file
    """
    # Get all required environment variables
    account_type_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_TYPE", "service_account")
    account_type = account_type_raw.strip() if account_type_raw else "service_account"
    
    project_id_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_PROJECT_ID", "")
    project_id = project_id_raw.strip() if project_id_raw else ""
    
    private_key_id_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID", "")
    private_key_id = private_key_id_raw.strip() if private_key_id_raw else ""
    
    private_key_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "")
    private_key = private_key_raw.strip() if private_key_raw else ""
    
    client_email_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL", "")
    client_email = client_email_raw.strip() if client_email_raw else ""
    
    client_id_raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_CLIENT_ID", "")
    client_id = client_id_raw.strip() if client_id_raw else ""
    
    # Validate required fields
    if not account_type:
        account_type = "service_account"
    if not project_id or not private_key or not client_email:
        raise ValueError("Missing required Google service account credentials in environment variables")
    
    # Remove surrounding quotes if present and convert \n to actual newlines
    if private_key.startswith('"') and private_key.endswith('"'):
        private_key = private_key[1:-1]
    private_key = private_key.replace('\\n', '\n')
    
    service_account_info = {
        "type": account_type,
        "project_id": project_id,
        "private_key_id": private_key_id,
        "private_key": private_key,
        "client_email": client_email,
        "client_id": client_id,
        "auth_uri": os.getenv("GOOGLE_SERVICE_ACCOUNT_AUTH_URI", "https://accounts.google.com/o/oauth2/auth").strip(),
        "token_uri": os.getenv("GOOGLE_SERVICE_ACCOUNT_TOKEN_URI", "https://oauth2.googleapis.com/token").strip(),
        "auth_provider_x509_cert_url": os.getenv("GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL", "https://www.googleapis.com/oauth2/v1/certs").strip(),
        "client_x509_cert_url": os.getenv("GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL", "").strip(),
        "universe_domain": os.getenv("GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN", "googleapis.com").strip()
    }
    
    # Validate the credentials structure
    if not service_account_info["type"]:
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_TYPE is empty or invalid")
    
    # Create temporary file for credentials
    temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json.dump(service_account_info, temp_file, indent=2)
    temp_file.close()
    
    return temp_file.name

# Lazy initialization function
def init_google_credentials():
    """Initialize Google credentials file (called when needed)"""
    global _credentials_file
    if _credentials_file is None:
        _credentials_file = get_google_credentials()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _credentials_file
    return _credentials_file

# Initialize credentials file (with error handling)
_credentials_file = None
try:
    _credentials_file = get_google_credentials()
    if _credentials_file:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _credentials_file
except Exception as e:
    # Credentials will be initialized when services are first used
    print(f"Warning: Could not initialize Google credentials at import: {e}")
    _credentials_file = None

# Project configuration
GOOGLE_PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID", "intentify-prod-485508")
GOOGLE_LOCATION = os.getenv("GOOGLE_LOCATION", "us-central1")
VERTEX_AI_API_KEY = os.getenv("VERTEX_AI_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", VERTEX_AI_API_KEY)  # Fallback to Vertex AI key

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://intentify:intentify123@localhost:5432/intentify_db"
)
