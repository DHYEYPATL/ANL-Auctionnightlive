"""
Structured logging — HD-SEC-09:
Never log passwords, tokens, full idempotency keys.
Log first 8 chars of idempotency_key only.
"""
import json
import logging
import re
from datetime import datetime, timezone

REDACT_PATTERNS = [
    re.compile(r'"password"\s*:\s*"[^"]*"', re.IGNORECASE),
    re.compile(r'"access_token"\s*:\s*"[^"]*"', re.IGNORECASE),
    re.compile(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', re.IGNORECASE),
]


def _redact(msg: str) -> str:
    for pat in REDACT_PATTERNS:
        msg = pat.sub('"[REDACTED]"', msg)
    return msg


class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        msg = record.getMessage()
        # HD-SEC-09: redact sensitive values
        msg = _redact(msg)
        log: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": msg,
            "logger": record.name,
        }
        for field in ("request_id", "actor_id", "rfq_id", "outcome"):
            if hasattr(record, field):
                log[field] = getattr(record, field)
        # Idempotency key: log only first 8 chars
        if hasattr(record, "idempotency_key"):
            key = str(getattr(record, "idempotency_key"))
            log["idempotency_key_prefix"] = key[:8]
        return json.dumps(log)


def setup_logging(debug: bool = False) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredFormatter())
    level = logging.DEBUG if debug else logging.INFO
    logging.root.setLevel(level)
    logging.root.handlers = [handler]


logger = logging.getLogger("anl")
