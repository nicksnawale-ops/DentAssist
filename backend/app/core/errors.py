"""Uniform error responses matching the frontend's ApiError shape:
{ "message": str, "code": str, "fieldErrors"?: {field: message} }
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status_code: int, message: str, code: str, field_errors: dict[str, str] | None = None):
        self.status_code = status_code
        self.message = message
        self.code = code
        self.field_errors = field_errors


def not_found(entity: str) -> AppError:
    return AppError(404, f"{entity} not found", f"{entity.upper().replace(' ', '_')}_NOT_FOUND")


def forbidden(message: str = "You do not have access to this resource") -> AppError:
    return AppError(403, message, "FORBIDDEN")


def bad_request(message: str, code: str = "BAD_REQUEST") -> AppError:
    return AppError(400, message, code)


def conflict(message: str, code: str = "CONFLICT") -> AppError:
    return AppError(409, message, code)


def _body(message: str, code: str, field_errors: dict[str, str] | None = None) -> dict:
    body: dict = {"message": message, "code": code}
    if field_errors:
        body["fieldErrors"] = field_errors
    return body


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=_body(exc.message, exc.code, exc.field_errors))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        codes = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(message, codes.get(exc.status_code, "HTTP_ERROR")),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        field_errors: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
            field_errors[".".join(loc) or "request"] = err.get("msg", "Invalid value")
        return JSONResponse(status_code=422, content=_body("Some fields are invalid", "VALIDATION_ERROR", field_errors))
