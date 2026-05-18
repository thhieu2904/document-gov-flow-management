"""Deprecated task router.

MVP core now treats document_assignments as work items. This module is kept
only to avoid stale imports during the refactor and is not mounted in main.py.
Progress APIs will be implemented from assignments in a later phase.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/tasks", tags=["tasks"])
