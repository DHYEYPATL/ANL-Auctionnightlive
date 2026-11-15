import logging
import json
import uuid
from datetime import datetime, timezone


class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        log: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        for field in ("request_id", "actor_id", "rfq_id"):
            if hasattr(record, field):
                log[field] = getattr(record, field)
        return json.dumps(log)


def setup_logging(debug: bool = False) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredFormatter())
    level = logging.DEBUG if debug else logging.INFO
    logging.root.setLevel(level)
    logging.root.handlers = [handler]


logger = logging.getLogger("anl")
