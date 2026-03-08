from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.utils.deprecation import MiddlewareMixin


class SimpleCorsMiddleware(MiddlewareMixin):
    def process_response(self, _: HttpRequest, response: HttpResponse) -> HttpResponse:
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return response
