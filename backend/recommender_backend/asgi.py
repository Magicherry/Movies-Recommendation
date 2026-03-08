import os
import sys
from pathlib import Path

from django.core.asgi import get_asgi_application

project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "recommender_backend.settings")

application = get_asgi_application()
