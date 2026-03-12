from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.utils.deprecation import MiddlewareMixin


class SimpleCorsMiddleware(MiddlewareMixin):
    def _set_cors_headers(self, response: HttpResponse) -> HttpResponse:
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    def process_request(self, request: HttpRequest) -> HttpResponse | None:
        if request.method == "OPTIONS":
            # Return a successful preflight response for cross-origin POST requests.
            return self._set_cors_headers(HttpResponse(status=200))
        return None

    def process_response(self, _: HttpRequest, response: HttpResponse) -> HttpResponse:
        return self._set_cors_headers(response)
