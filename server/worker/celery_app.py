"""
Celery application configuration.
Redis is used as both the broker and result backend.

To start the worker:
    cd server
    celery -A worker.celery_app worker --loglevel=info

To start beat (scheduled tasks):
    cd server
    celery -A worker.celery_app beat --loglevel=info
"""
import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RESULT_BACKEND = os.getenv("REDIS_RESULT_URL", "redis://localhost:6379/1")

celery_app = Celery(
    "portsync",
    broker=REDIS_URL,
    backend=RESULT_BACKEND,
    include=["worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_expires=86400,          # 24 hours
    task_acks_late=True,           # only ack after task completes (safer)
    worker_prefetch_multiplier=1,  # fair distribution
    beat_schedule={
        "nightly-retraining": {
            "task":     "worker.tasks.retrain_model_task",
            "schedule": {"hour": 2, "minute": 0},  # 2 AM daily (crontab style via config)
            "args":     [],
        },
    },
)
