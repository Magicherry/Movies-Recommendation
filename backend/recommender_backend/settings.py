from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "replace-this-in-production")
DEBUG = os.environ.get("DEBUG", "False").strip().lower() == "true"

allowed_hosts_env = os.environ.get("ALLOWED_HOSTS", "").strip()
if allowed_hosts_env:
    ALLOWED_HOSTS = [host.strip() for host in allowed_hosts_env.split(",") if host.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ["*"]
else:
    # Safe default for Render plus local health checks.
    ALLOWED_HOSTS = [".onrender.com", "localhost", "127.0.0.1"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "api.cors.SimpleCorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "recommender_backend.urls"

TEMPLATES = []
WSGI_APPLICATION = "recommender_backend.wsgi.application"
ASGI_APPLICATION = "recommender_backend.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"

# Render terminates TLS at the proxy layer; trust forwarded proto for secure URL handling.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
