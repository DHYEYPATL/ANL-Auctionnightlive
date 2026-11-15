import uuid
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None):
        self.code = code
        self.app_message = message
        self.details = details or {}
        super().__init__(status_code=status_code, detail=message)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
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
        headers={"Cache-Control": "no-store"},
    )


async def pg_lock_timeout_handler(request: Request, exc: Exception) -> JSONResponse:
    """HD-CON-06: lock_timeout -> 503 AUCTION_BUSY"""
    msg = str(exc)
    if "lock timeout" in msg.lower() or "lock_timeout" in msg.lower():
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "AUCTION_BUSY", "message": "Auction is busy. Retry in a moment."}},
            headers={"Retry-After": "1", "Cache-Control": "no-store"},
        )
    # Other DB operational errors
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "SERVICE_UNAVAILABLE", "message": "Service temporarily unavailable."}},
        headers={"Retry-After": "2", "Cache-Control": "no-store"},
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
