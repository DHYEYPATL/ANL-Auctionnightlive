from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "anl",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.auction_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # HD-LIFE-05: reliability settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=30,
    task_soft_time_limit=20,
    # Redis visibility timeout must exceed task_time_limit
    broker_transport_options={"visibility_timeout": 3600},
    beat_schedule={
        "reconcile-auctions-every-30s": {
            "task": "app.workers.auction_tasks.reconcile_auctions",
            "schedule": 30.0,
        },
    },
)
