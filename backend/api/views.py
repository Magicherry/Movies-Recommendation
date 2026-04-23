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

SCRAPE_STATE_PATH = service.artifacts_dir / "scrape_state.json"


def _default_scrape_summary() -> dict[str, int]:
    return {
        "links_id_hit": 0,
        "title_search_hit": 0,
        "no_match": 0,
    }


def _default_scrape_state() -> dict[str, object]:
    return {
        "status": "idle",
        "processed": 0,
        "total": 0,
        "message": "",
        "summary": _default_scrape_summary(),
    }


def _normalize_scrape_state(raw: object) -> dict[str, object]:
    base = _default_scrape_state()
    if not isinstance(raw, dict):
        return base

    status = str(raw.get("status", base["status"]))
    processed = int(raw.get("processed", base["processed"]) or 0)
    total = int(raw.get("total", base["total"]) or 0)
    message = str(raw.get("message", base["message"]))

    summary_raw = raw.get("summary", {})
    if not isinstance(summary_raw, dict):
        summary_raw = {}
    summary = {
        "links_id_hit": int(summary_raw.get("links_id_hit", 0) or 0),
        "title_search_hit": int(summary_raw.get("title_search_hit", 0) or 0),
        "no_match": int(summary_raw.get("no_match", 0) or 0),
    }

    # If server restarted while status was running, keep last counters but reset state.
    if status in {"running", "starting"}:
        status = "idle"
        message = "No active scraping process."

    return {
        "status": status,
        "processed": max(0, processed),
        "total": max(0, total),
        "message": message,
        "summary": summary,
    }


def _load_scrape_state() -> dict[str, object]:
    if not SCRAPE_STATE_PATH.exists():
        return _default_scrape_state()
    try:
        with open(SCRAPE_STATE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return _normalize_scrape_state(data)
    except (OSError, json.JSONDecodeError, ValueError):
        return _default_scrape_state()


def _save_scrape_state(state: dict[str, object]) -> None:
    try:
        SCRAPE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SCRAPE_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except OSError:
        # Persistence is best-effort and should not break API behavior.
        pass


scrape_state = _load_scrape_state()
scrape_process = None

def run_scrape_thread(api_key: str, refresh: bool = False):
    global scrape_state, scrape_process
    scrape_state["status"] = "running"
    scrape_state["processed"] = 0
    scrape_state["total"] = 0
    scrape_state["message"] = "Starting scrape..."
    scrape_state["summary"] = {
        "links_id_hit": 0,
        "title_search_hit": 0,
        "no_match": 0,
    }
    _save_scrape_state(scrape_state)
    
    project_root = Path(__file__).resolve().parents[2]
    script_path = project_root / "scripts" / "scrape_tmdb.py"
    
    env = os.environ.copy()
    if api_key:
        env["TMDB_API_KEY"] = api_key

    cmd = ["python", str(script_path)]
    artifacts_dir_env = os.environ.get("STREAMX_DATA_DIR", "").strip()
    if artifacts_dir_env:
        cmd.extend(["--artifacts-dir", artifacts_dir_env])
    if refresh:
        cmd.append("--refresh")

    try:
        scrape_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(project_root),
            env=env
        )
        
        error_lines = []
        for line in scrape_process.stdout:
            line = line.strip()
            if not line:
                continue
                
            scrape_state["message"] = line
            if "Error:" in line or scrape_process.poll() is not None:
                error_lines.append(line)
            
            match = re.search(r"Processed (\d+)/(\d+)", line)
            if match:
                scrape_state["processed"] = int(match.group(1))
                scrape_state["total"] = int(match.group(2))
                _save_scrape_state(scrape_state)
            elif "Scraping TMDB for" in line:
                match = re.search(r"Scraping TMDB for (\d+) movies", line)
                if match:
                    scrape_state["total"] = int(match.group(1))
                    _save_scrape_state(scrape_state)
            elif line.startswith("SCRAPE_SUMMARY "):
                match = re.search(
                    r"links_id_hit=(\d+)\s+title_search_hit=(\d+)\s+no_match=(\d+)",
                    line,
                )
                if match:
                    scrape_state["summary"] = {
                        "links_id_hit": int(match.group(1)),
                        "title_search_hit": int(match.group(2)),
                        "no_match": int(match.group(3)),
                    }
                    _save_scrape_state(scrape_state)
            elif "All movies enriched" in line:
                scrape_state["status"] = "completed"
                if scrape_state["total"] > 0:
                    scrape_state["processed"] = scrape_state["total"]
                _save_scrape_state(scrape_state)
                
        scrape_process.wait()
        if scrape_process.returncode == 0:
            scrape_state["status"] = "completed"
            if scrape_state["total"] > 0:
                scrape_state["processed"] = scrape_state["total"]
            _save_scrape_state(scrape_state)
        elif scrape_process.returncode == -15 or scrape_process.returncode == 15 or scrape_process.returncode == 1:
            # Handle cancellation
            scrape_state["status"] = "error"
            scrape_state["message"] = "Scraping cancelled by user."
            _save_scrape_state(scrape_state)
        else:
            scrape_state["status"] = "error"
            error_msg = " ".join(error_lines) if error_lines else scrape_state['message']
            if error_msg.startswith("Error: "):
                scrape_state["message"] = error_msg
            else:
                scrape_state["message"] = f"Error: {error_msg}"
            _save_scrape_state(scrape_state)
            
    except Exception as e:
        scrape_state["status"] = "error"
        scrape_state["message"] = str(e)
        _save_scrape_state(scrape_state)
    finally:
        scrape_process = None



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


def _resolve_reason_payload(request: HttpRequest, item_id: int, similar: list[dict] | None = None) -> list[dict]:
    mode = (request.GET.get("mode") or "recommended").strip().lower()
    if mode == "neutral":
        return []
    if mode == "similar":
        reference_item_id = _int_param(request, "reference_item_id", 0)
        if reference_item_id > 0:
            return service.get_movie_similarity_reasons(item_id=item_id, reference_item_id=reference_item_id)
        return []

    user_id = _int_param(request, "user_id", 0)
    return service.get_movie_recommendation_reasons(
        item_id=item_id,
        user_id=user_id if user_id > 0 else None,
        similar_candidates=similar,
    )


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
    sort_by = request.GET.get("sort_by", "year")
    sort_order = request.GET.get("sort_order", "desc")
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
def movie_detail(request: HttpRequest, item_id: int) -> JsonResponse:
    try:
        movie = service.get_movie(item_id)
        if movie is None:
            return _error(f"Movie {item_id} not found", status=404)
        n = max(1, min(_int_param(request, "n", 100), 200))
        similar = service.similar_for_item(item_id=item_id, n=n)
        why_recommended = _resolve_reason_payload(request, item_id=item_id, similar=similar)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"movie": movie, "similar": similar, "why_recommended": why_recommended})


@require_GET
def movie_why_recommended(request: HttpRequest, item_id: int) -> JsonResponse:
    try:
        movie = service.get_movie(item_id)
        if movie is None:
            return _error(f"Movie {item_id} not found", status=404)
        reasons = _resolve_reason_payload(request, item_id=item_id)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"item_id": item_id, "why_recommended": reasons})


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
def person_movies(request: HttpRequest) -> JsonResponse:
    name = request.GET.get("name", "")
    if not name.strip():
        return _error("Missing required query parameter: name", status=400)
    try:
        rows = service.get_movies_by_person(person_name=name)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"person_name": name, "items": rows})

@require_GET
def tmdb_person(request: HttpRequest, person_id: int) -> JsonResponse:
    """Fetch person details from TMDB."""
    api_key = _get_tmdb_api_key()
    if not api_key:
        return _error("TMDB API key not configured.", status=503)
    import requests
    url = f"https://api.themoviedb.org/3/person/{person_id}"
    try:
        resp = requests.get(url, params={"api_key": api_key}, timeout=8)
        if resp.status_code == 404:
            return _error("Person not found", status=404)
        if resp.status_code != 200:
            return _error("TMDB error", status=502)
        data = resp.json()
        return JsonResponse(data)
    except Exception as e:
        return _error(f"TMDB request failed: {e}", status=502)

@require_GET
def db_stats(request: HttpRequest) -> JsonResponse:
    try:
        stats = service.get_db_stats()
        return JsonResponse(stats)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)


@require_GET
def training_histories(request: HttpRequest) -> JsonResponse:
    try:
        return JsonResponse(service.get_all_training_histories())
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


@require_GET
def model_preload(_: HttpRequest) -> JsonResponse:
    try:
        payload = service.preload_active_model()
        return JsonResponse(payload)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)


@csrf_exempt
@require_http_methods(["POST"])
def scrape_start(request: HttpRequest) -> JsonResponse:
    global scrape_state, scrape_process
    if scrape_state["status"] == "running":
        return JsonResponse({"status": "already_running"})
    
    try:
        body = json.loads(request.body)
        api_key = body.get("api_key", "")
        refresh = body.get("refresh") is True
    except json.JSONDecodeError:
        api_key = ""
        refresh = False

    scrape_state["status"] = "starting"
    scrape_state["processed"] = 0
    scrape_state["total"] = 0
    scrape_state["message"] = "Starting scrape..."
    scrape_state["summary"] = {
        "links_id_hit": 0,
        "title_search_hit": 0,
        "no_match": 0,
    }
    _save_scrape_state(scrape_state)
        
    thread = threading.Thread(target=run_scrape_thread, args=(api_key, refresh))
    thread.daemon = True
    thread.start()
    
    return JsonResponse({"status": "started"})


@csrf_exempt
@require_http_methods(["POST"])
def scrape_cancel(request: HttpRequest) -> JsonResponse:
    global scrape_state, scrape_process
    if scrape_state["status"] != "running" and scrape_state["status"] != "starting":
        return JsonResponse({"status": "not_running"})
        
    if scrape_process is not None:
        try:
            scrape_process.terminate()
            scrape_state["status"] = "error"
            scrape_state["message"] = "Scraping cancelled by user."
            _save_scrape_state(scrape_state)
        except Exception as e:
            return _error(f"Failed to cancel: {e}", status=500)
    else:
        scrape_state["status"] = "error"
        scrape_state["message"] = "Scraping cancelled by user."
        _save_scrape_state(scrape_state)
            
    return JsonResponse({"status": "cancelled"})


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

def _get_tmdb_api_key() -> str:
    from pathlib import Path
    project_root = Path(__file__).resolve().parents[2]
    env_path = project_root / ".env"
    api_key = ""
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    if key.strip() == "TMDB_API_KEY":
                        api_key = val.strip().strip("'\"")
                        break
    if not api_key:
        api_key = os.environ.get("TMDB_API_KEY", "")
    if api_key == "your_real_api_key_here":
        api_key = ""
    return api_key


@require_GET
def tmdb_search(request: HttpRequest) -> JsonResponse:
    """Search TMDB by query and optional year. Returns list of results for user to pick."""
    query = request.GET.get("q", "").strip()
    if not query:
        return _error("Missing query parameter: q", status=400)
    year = request.GET.get("year", "").strip()
    api_key = _get_tmdb_api_key()
    if not api_key:
        return _error("TMDB API key not configured. Set it in Settings.", status=503)
    import requests
    url = "https://api.themoviedb.org/3/search/movie"
    base_params = {"api_key": api_key, "query": query}
    use_year = bool(year and len(year) == 4 and year.isdigit())

    def fetch_results(with_year: bool):
        params = dict(base_params)
        if with_year and use_year:
            params["primary_release_year"] = year
        resp = requests.get(url, params=params, timeout=8)
        data = resp.json()
        return resp, data

    try:
        resp, data = fetch_results(with_year=True)
        results = data.get("results", [])
        # Fallback: if strict year yields nothing, retry without year filter.
        if resp.status_code == 200 and use_year and not results:
            resp, data = fetch_results(with_year=False)
    except Exception as e:
        return _error(f"TMDB request failed: {e}", status=502)
    if resp.status_code != 200:
        return _error(data.get("status_message", "TMDB error"), status=502)
    results = (data.get("results") or [])[:15]
    out = []
    for r in results:
        poster_path = r.get("poster_path") or ""
        backdrop_path = r.get("backdrop_path") or ""
        out.append({
            "tmdb_id": r.get("id"),
            "title": r.get("title", ""),
            "release_date": r.get("release_date", ""),
            "overview": r.get("overview", ""),
            "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else "",
            "backdrop_url": f"https://image.tmdb.org/t/p/w1280{backdrop_path}" if backdrop_path else "",
        })
    return JsonResponse({"query": query, "year": year, "results": out})


@require_GET
def tmdb_movie_images(request: HttpRequest, tmdb_id: int) -> JsonResponse:
    """Fetch all posters and backdrops for a TMDB movie (GET /movie/{id}/images)."""
    api_key = _get_tmdb_api_key()
    if not api_key:
        return _error("TMDB API key not configured. Set it in Settings.", status=503)
    import requests
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}/images"
    try:
        resp = requests.get(url, params={"api_key": api_key}, timeout=10)
        data = resp.json()
    except Exception as e:
        return _error(f"TMDB request failed: {e}", status=502)
    if resp.status_code != 200:
        return _error(data.get("status_message", "TMDB error"), status=502)
    base = "https://image.tmdb.org/t/p"
    posters_raw = data.get("posters") or []
    backdrops_raw = data.get("backdrops") or []
    seen_p = set()
    posters = []
    for p in sorted(posters_raw, key=lambda x: -(x.get("vote_average") or 0)):
        fp = p.get("file_path") or ""
        if not fp or fp in seen_p:
            continue
        seen_p.add(fp)
        posters.append({
            "file_path": fp,
            "url": f"{base}/w500{fp}",
            "vote_average": p.get("vote_average") or 0,
            "width": p.get("width") or 0,
            "height": p.get("height") or 0,
        })
    seen_b = set()
    backdrops = []
    for b in sorted(backdrops_raw, key=lambda x: -(x.get("vote_average") or 0)):
        fp = b.get("file_path") or ""
        if not fp or fp in seen_b:
            continue
        seen_b.add(fp)
        backdrops.append({
            "file_path": fp,
            "url": f"{base}/w1280{fp}",
            "vote_average": b.get("vote_average") or 0,
            "width": b.get("width") or 0,
            "height": b.get("height") or 0,
        })
    return JsonResponse({"posters": posters[:30], "backdrops": backdrops[:30]})


@csrf_exempt
@require_http_methods(["POST"])
def movie_apply_scrape(request: HttpRequest, item_id: int) -> JsonResponse:
    """Apply selected TMDB result to one movie (title, poster, backdrop, overview, tmdb_id)."""
    try:
        body = json.loads(request.body)
        poster_url = (body.get("poster_url") or "").strip()
        backdrop_url = (body.get("backdrop_url") or "").strip()
        overview = (body.get("overview") or "").strip()
        scraped_title = (body.get("scraped_title") or "").strip()
        raw_tmdb_id = body.get("tmdb_id")
        tmdb_id = int(raw_tmdb_id) if raw_tmdb_id not in (None, "") else None
    except (json.JSONDecodeError, ValueError, TypeError):
        return _error("Invalid JSON or tmdb_id", status=400)
        
    cast = []
    directors = []
    if tmdb_id:
        api_key = _get_tmdb_api_key()
        if api_key:
            import requests
            detail_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
            try:
                detail_resp = requests.get(detail_url, params={"api_key": api_key, "append_to_response": "credits"}, timeout=8)
                if detail_resp.status_code == 200:
                    movie_data = detail_resp.json()
                    credits = movie_data.get("credits", {})
                    if credits:
                        for c in credits.get("cast", [])[:10]:
                            cast.append({
                                "id": c.get("id"),
                                "name": c.get("name"),
                                "character": c.get("character"),
                                "profile_path": c.get("profile_path")
                            })
                        for c in credits.get("crew", []):
                            if c.get("job") == "Director":
                                directors.append({
                                    "id": c.get("id"),
                                    "name": c.get("name"),
                                    "profile_path": c.get("profile_path")
                                })
            except Exception:
                pass

    success = service.update_movie_enriched(
        item_id=item_id,
        poster_url=poster_url or None,
        backdrop_url=backdrop_url or None,
        overview=overview or None,
        tmdb_id=tmdb_id,
        scraped_title=scraped_title or None,
        cast=json.dumps(cast),
        directors=json.dumps(directors),
    )
    if not success:
        return _error("Movie not found", status=404)
    return JsonResponse({"status": "ok", "item_id": item_id, "tmdb_id": tmdb_id, "scraped_title": scraped_title})


def _normalize_title_refresh(t):
    t = t.strip()
    if t.endswith(", The"):
        t = "The " + t[:-5]
    elif t.endswith(", A"):
        t = "A " + t[:-3]
    elif t.endswith(", An"):
        t = "An " + t[:-4]
    return t


@csrf_exempt
@require_http_methods(["POST"])
def movie_refresh_metadata(request: HttpRequest, item_id: int) -> JsonResponse:
    """Re-fetch TMDB by current movie title/year; try clean title then names in parentheses until one returns results."""
    movie = service.get_movie(item_id)
    if not movie:
        return _error("Movie not found", status=404)
    import re
    title_year = movie.get("title", "")
    s = str(title_year).strip()
    year = ""
    match = re.search(r"^(.*?)\s*\((\d{4})\)\s*$", s)
    if match:
        s = match.group(1).strip()
        year = match.group(2)
    inner_names = re.findall(r"\(([^)]*)\)", s)
    clean_title = re.sub(r"\s*\([^)]*\)\s*", " ", s)
    clean_title = re.sub(r"\s+", " ", clean_title).strip()
    queries = [_normalize_title_refresh(clean_title)] + [_normalize_title_refresh(n) for n in inner_names if n.strip()]

    api_key = _get_tmdb_api_key()
    if not api_key:
        return _error("TMDB API key not configured.", status=503)
    import requests
    url = "https://api.themoviedb.org/3/search/movie"

    def do_search(query, with_year=True):
        params = {"api_key": api_key, "query": query}
        if with_year and year:
            params["primary_release_year"] = year
        try:
            resp = requests.get(url, params=params, timeout=8)
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("results"):
                best = data["results"][0]
                tmdb_id = best.get("id")
                if tmdb_id:
                    detail_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
                    detail_resp = requests.get(detail_url, params={"api_key": api_key, "append_to_response": "credits"}, timeout=8)
                    if detail_resp.status_code == 200:
                        return detail_resp.json()
                return best
        except Exception:
            pass
        return None

    best = None
    for q in queries:
        if not q:
            continue
        best = do_search(q, with_year=True)
        if best:
            break
    if not best:
        for q in queries:
            if not q:
                continue
            best = do_search(q, with_year=False)
            if best:
                break

    if not best:
        return JsonResponse({
            "status": "no_results",
            "message": "No TMDB match found for this title.",
            "item_id": item_id,
        })

    poster_path = best.get("poster_path") or ""
    backdrop_path = best.get("backdrop_path") or ""
    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else ""
    backdrop_url = f"https://image.tmdb.org/t/p/w1280{backdrop_path}" if backdrop_path else ""
    overview = best.get("overview", "") or ""
    tmdb_id = best.get("id")
    scraped_title = (best.get("title") or "").strip()
    
    cast = []
    directors = []
    credits = best.get("credits", {})
    if credits:
        for c in credits.get("cast", [])[:10]:
            cast.append({
                "id": c.get("id"),
                "name": c.get("name"),
                "character": c.get("character"),
                "profile_path": c.get("profile_path")
            })
        for c in credits.get("crew", []):
            if c.get("job") == "Director":
                directors.append({
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "profile_path": c.get("profile_path")
                })
                
    success = service.update_movie_enriched(
        item_id=item_id,
        poster_url=poster_url or None,
        backdrop_url=backdrop_url or None,
        overview=overview or None,
        tmdb_id=tmdb_id,
        scraped_title=scraped_title or None,
        cast=json.dumps(cast),
        directors=json.dumps(directors),
    )
    if not success:
        return _error("Update failed", status=500)
    return JsonResponse({"status": "ok", "item_id": item_id})


@csrf_exempt
@require_http_methods(["POST"])
def movie_update_images(request: HttpRequest, item_id: int) -> JsonResponse:
    """Update or clear poster and/or backdrop URL for one movie. Send empty string to clear."""
    try:
        body = json.loads(request.body)
        poster_url = (body.get("poster_url") or "").strip() if "poster_url" in body else None
        backdrop_url = (body.get("backdrop_url") or "").strip() if "backdrop_url" in body else None
    except json.JSONDecodeError:
        return _error("Invalid JSON", status=400)
    if "poster_url" not in body and "backdrop_url" not in body:
        return _error("Provide at least poster_url or backdrop_url", status=400)
    success = service.update_movie_enriched(
        item_id=item_id,
        poster_url=poster_url,
        backdrop_url=backdrop_url,
        overview=None,
    )
    if not success:
        return _error("Movie not found", status=404)
    return JsonResponse({"status": "ok", "item_id": item_id})


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

