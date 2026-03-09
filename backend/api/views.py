from __future__ import annotations

from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET

from api.services import service


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
def recommend(_: HttpRequest, user_id: int) -> JsonResponse:
    try:
        recommendations = service.recommend_for_user(user_id=user_id, n=10)
    except ValueError as exc:
        return _error(str(exc), status=404)
    except FileNotFoundError as exc:
        return _error(str(exc), status=500)
    return JsonResponse({"user_id": user_id, "recommendations": recommendations})


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
