from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import uuid


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None):
        self.code = code
        self.app_message = message
        self.details = details or {}
        super().__init__(status_code=status_code, detail=message)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = str(uuid.uuid4())
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.app_message,
                "details": exc.details,
                "request_id": request_id,
            }
        },
    )


def not_found(msg: str = "Not found") -> AppError:
    return AppError(404, "RFQ_NOT_FOUND", msg)


def forbidden(msg: str = "Access denied") -> AppError:
    return AppError(403, "FORBIDDEN", msg)


def unauthenticated() -> AppError:
    return AppError(401, "UNAUTHENTICATED", "Authentication required")


def conflict(code: str, msg: str, details: dict | None = None) -> AppError:
    return AppError(409, code, msg, details)


def validation_error(msg: str, details: dict | None = None) -> AppError:
    return AppError(422, "INVALID_QUOTE", msg, details)


def bad_request(msg: str, details: dict | None = None) -> AppError:
    return AppError(400, "VALIDATION_ERROR", msg, details)
