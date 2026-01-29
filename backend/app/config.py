import os
import json
import tempfile
from urllib.parse import urlsplit, urlunsplit
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
    # Credentials will be initialized when services are first used (Speech-to-Text)
    print(f"Warning: Could not initialize Google credentials at import: {e}")
    _credentials_file = None


def cleanup_google_credentials() -> None:
    """Remove temp credentials file and clear env. Call on app shutdown."""
    global _credentials_file
    if _credentials_file and os.path.isfile(_credentials_file):
        try:
            os.unlink(_credentials_file)
        except Exception:
            pass
    _credentials_file = None
    os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)

# Project configuration
GOOGLE_PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID", "intentify-prod-485508")
GOOGLE_LOCATION = os.getenv("GOOGLE_LOCATION", "us-central1")
VERTEX_AI_API_KEY = os.getenv("VERTEX_AI_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", VERTEX_AI_API_KEY)  # Fallback to Vertex AI key

# Database configuration
def _running_in_docker() -> bool:
    # /.dockerenv is present in most Docker containers. Keep this lightweight.
    return os.path.exists("/.dockerenv") or os.getenv("DOCKER", "").lower() in ("1", "true", "yes")


def _build_database_url(
    *,
    user: str,
    password: str,
    host: str,
    port: str,
    db: str,
) -> str:
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}"


def _replace_db_host(database_url: str, new_host: str) -> str:
    parts = urlsplit(database_url)
    # urlsplit netloc may include userinfo and port.
    username = parts.username or ""
    password = parts.password or ""
    port = parts.port
    userinfo = ""
    if username and password:
        userinfo = f"{username}:{password}@"
    elif username and not password:
        userinfo = f"{username}@"

    hostport = new_host
    if port is not None:
        hostport = f"{new_host}:{port}"

    new_netloc = f"{userinfo}{hostport}"
    return urlunsplit((parts.scheme, new_netloc, parts.path, parts.query, parts.fragment))


_default_local_url = "postgresql+asyncpg://intentify:intentify123@localhost:5432/intentify_db"
_raw_db_url = (os.getenv("DATABASE_URL") or "").strip()

if _raw_db_url:
    # If a developer uses the provided .env inside Docker, "localhost" would point to the container
    # itself. Make it work out-of-the-box by swapping localhost -> POSTGRES_HOST (default: postgres).
    if _running_in_docker():
        try:
            parsed = urlsplit(_raw_db_url)
            if (parsed.hostname or "").lower() in ("localhost", "127.0.0.1"):
                _raw_db_url = _replace_db_host(_raw_db_url, os.getenv("POSTGRES_HOST", "postgres").strip() or "postgres")
        except Exception:
            # If parsing fails, keep the original value and let SQLAlchemy raise a clearer error.
            pass
    DATABASE_URL = _raw_db_url
else:
    # Fallback to discrete variables (useful for Docker/CI)
    POSTGRES_USER = os.getenv("POSTGRES_USER", "intentify").strip() or "intentify"
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "intentify123").strip() or "intentify123"
    POSTGRES_DB = os.getenv("POSTGRES_DB", "intentify_db").strip() or "intentify_db"
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432").strip() or "5432"
    default_host = "postgres" if _running_in_docker() else "localhost"
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", default_host).strip() or default_host

    DATABASE_URL = _build_database_url(
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        db=POSTGRES_DB,
    )
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() in ("1", "true", "yes")

# CORS (comma-separated origins; default localhost:3000)
_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000").strip()
CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()] or ["http://localhost:3000"]

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
