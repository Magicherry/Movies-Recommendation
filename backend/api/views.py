from __future__ import annotations

from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import subprocess
import threading
import re
from pathlib import Path

import os

from api.services import service

scrape_state = {
    "status": "idle",
    "processed": 0,
    "total": 0,
    "message": ""
}

def run_scrape_thread(api_key: str):
    global scrape_state
    scrape_state["status"] = "running"
    scrape_state["processed"] = 0
    scrape_state["total"] = 0
    scrape_state["message"] = "Starting scrape..."
    
    project_root = Path(__file__).resolve().parents[2]
    script_path = project_root / "scripts" / "scrape_tmdb.py"
    
    env = os.environ.copy()
    if api_key:
        env["TMDB_API_KEY"] = api_key

    try:
        process = subprocess.Popen(
            ["python", str(script_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(project_root),
            env=env
        )
        
        error_lines = []
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
                
            scrape_state["message"] = line
            if "Error:" in line or process.poll() is not None:
                error_lines.append(line)
            
            match = re.search(r"Processed (\d+)/(\d+)", line)
            if match:
                scrape_state["processed"] = int(match.group(1))
                scrape_state["total"] = int(match.group(2))
            elif "Scraping TMDB for" in line:
                match = re.search(r"Scraping TMDB for (\d+) movies", line)
                if match:
                    scrape_state["total"] = int(match.group(1))
            elif "All movies enriched" in line:
                scrape_state["status"] = "completed"
                if scrape_state["total"] > 0:
                    scrape_state["processed"] = scrape_state["total"]
                
        process.wait()
        if process.returncode == 0:
            scrape_state["status"] = "completed"
            if scrape_state["total"] > 0:
                scrape_state["processed"] = scrape_state["total"]
        else:
            scrape_state["status"] = "error"
            error_msg = " ".join(error_lines) if error_lines else scrape_state['message']
            if error_msg.startswith("Error: "):
                scrape_state["message"] = error_msg
            else:
                scrape_state["message"] = f"Error: {error_msg}"
            
    except Exception as e:
        scrape_state["status"] = "error"
        scrape_state["message"] = str(e)



def _int_param(request: HttpRequest, name: str, default: int) -> int:
    raw = request.GET.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


@require_GET
def health(_: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})


@require_GET
def movies(request: HttpRequest) -> JsonResponse:
    limit = max(1, min(_int_param(request, "limit", 50), 200))
    offset = max(0, _int_param(request, "offset", 0))
    query = request.GET.get("q")
    genre = request.GET.get("genre")
    year = request.GET.get("year")
    sort_by = request.GET.get("sort_by", "item_id")
    sort_order = request.GET.get("sort_order", "asc")
    try:
        data = service.list_movies(
            limit=limit,
            offset=offset,
            query=query,
            genre=genre,
            year=year,
            sort_by=sort_by,
            sort_order=sort_order,
        )
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"items": data["items"], "total": data["total"], "limit": limit, "offset": offset})


@require_GET
def movie_detail(_: HttpRequest, item_id: int) -> JsonResponse:
    try:
        movie = service.get_movie(item_id)
        if movie is None:
            return _error(f"Movie {item_id} not found", status=404)
        similar = service.similar_for_item(item_id=item_id, n=10)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"movie": movie, "similar": similar})


@require_GET
def users(request: HttpRequest) -> JsonResponse:
    limit = max(1, min(_int_param(request, "limit", 50), 200))
    offset = max(0, _int_param(request, "offset", 0))
    try:
        data = service.list_users(limit=limit, offset=offset)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"items": data["items"], "total": data["total"], "limit": limit, "offset": offset})

@require_GET
def user_history(request: HttpRequest, user_id: int) -> JsonResponse:
    try:
        # Default limit is 20, but if 'all=1' is passed, we fetch everything
        limit = 0 if request.GET.get('all') == '1' else 20
        history = service.get_user_history(user_id=user_id, limit=limit)
    except ValueError as exc:
        return _error(str(exc), status=404)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"user_id": user_id, "history": history})

@require_GET
def recommend(request: HttpRequest, user_id: int) -> JsonResponse:
    n = max(1, min(_int_param(request, "n", 10), 100))
    try:
        recommendations = service.recommend_for_user(user_id=user_id, n=n)
    except ValueError as exc:
        return _error(str(exc), status=404)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"user_id": user_id, "n": n, "recommendations": recommendations})


@require_GET
def predict_rating(_: HttpRequest, user_id: int, item_id: int) -> JsonResponse:
    try:
        result = service.predict_rating(user_id=user_id, item_id=item_id)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse(result)


@require_GET
def search(request: HttpRequest) -> JsonResponse:
    query = request.GET.get("q", "")
    if not query.strip():
        return _error("Missing required query parameter: q", status=400)
    try:
        rows = service.search_movies(query=query, limit=20)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"query": query, "items": rows})

@require_GET
def db_stats(request: HttpRequest) -> JsonResponse:
    try:
        stats = service.get_db_stats()
        return JsonResponse(stats)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)

@csrf_exempt
@require_http_methods(["GET", "POST"])
def model_config(request: HttpRequest) -> JsonResponse:
    try:
        if request.method == "GET":
            return JsonResponse(service.get_model_config())
        elif request.method == "POST":
            try:
                body = json.loads(request.body)
                model_name = body.get("active_model")
                if not model_name:
                    return _error("Missing 'active_model' in request body", status=400)
                
                success = service.set_active_model(model_name)
                if success:
                    return JsonResponse({"status": "success", "active_model": model_name})
                else:
                    return _error(f"Model '{model_name}' not found or not loaded", status=404)
            except json.JSONDecodeError:
                return _error("Invalid JSON", status=400)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)


@csrf_exempt
@require_http_methods(["POST"])
def scrape_start(request: HttpRequest) -> JsonResponse:
    global scrape_state
    if scrape_state["status"] == "running":
        return JsonResponse({"status": "already_running"})
    
    try:
        body = json.loads(request.body)
        api_key = body.get("api_key", "")
    except json.JSONDecodeError:
        api_key = ""
        
    thread = threading.Thread(target=run_scrape_thread, args=(api_key,))
    thread.daemon = True
    thread.start()
    
    return JsonResponse({"status": "started"})


@require_GET
def scrape_status(request: HttpRequest) -> JsonResponse:
    return JsonResponse(scrape_state)

@require_GET
def scrape_key(request: HttpRequest) -> JsonResponse:
    import os
    from pathlib import Path
    
    project_root = Path(__file__).resolve().parents[2]
    env_path = project_root / ".env"
    
    api_key = ""
    # Manually parse .env file to avoid python-dotenv dependency in Django runtime
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    if "=" in line:
                        key, val = line.split("=", 1)
                        if key.strip() == "TMDB_API_KEY":
                            api_key = val.strip().strip("'\"")
                            break
                            
    if not api_key:
        api_key = os.environ.get("TMDB_API_KEY", "")
        
    if api_key == "your_real_api_key_here":
        api_key = ""
        
    return JsonResponse({"api_key": api_key})

@csrf_exempt
@require_http_methods(["POST"])
def scrape_test_key(request: HttpRequest) -> JsonResponse:
    try:
        body = json.loads(request.body)
        api_key = body.get("api_key", "")
    except json.JSONDecodeError:
        api_key = ""
        
    if not api_key:
        return JsonResponse({"valid": False, "message": "API Key is required"})
        
    import requests
    test_url = "https://api.themoviedb.org/3/configuration"
    try:
        test_resp = requests.get(test_url, params={"api_key": api_key}, timeout=5)
        test_data = test_resp.json()
        if test_resp.status_code == 200 and test_data.get("success") is not False:
            return JsonResponse({"valid": True, "message": "API Key is valid!"})
        else:
            return JsonResponse({"valid": False, "message": f"Invalid Key: {test_data.get('status_message', 'Unknown error')}"})
    except Exception as e:
        return JsonResponse({"valid": False, "message": f"Connection error: {str(e)}"})

