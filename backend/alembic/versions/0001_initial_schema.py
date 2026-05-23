"""initial simple manager staff schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("description", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_departments_name", "departments", ["name"])
    op.create_index("ix_departments_is_active", "departments", ["is_active"])

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("supabase_user_id", sa.String(length=64), unique=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255)),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("department_id", sa.String(length=36), sa.ForeignKey("departments.id")),
        sa.Column("position_label", sa.String(length=160)),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        *timestamps(),
    )
    for column in ["supabase_user_id", "full_name", "email", "role", "department_id", "is_active"]:
        op.create_index(f"ix_users_{column}", "users", [column], unique=column in {"supabase_user_id", "email"})

    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("code", sa.String(length=120)),
        sa.Column("summary", sa.Text()),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True)),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("department_id", sa.String(length=36), sa.ForeignKey("departments.id")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        *timestamps(),
    )
    for column in ["title", "code", "priority", "status", "issued_at", "due_at", "created_by", "department_id"]:
        op.create_index(f"ix_documents_{column}", "documents", [column])

    op.create_table(
        "document_assignments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("assigned_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assignee_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("instruction", sa.Text()),
        sa.Column("result_note", sa.Text()),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        *timestamps(),
    )
    for column in ["document_id", "assigned_by", "assignee_id", "priority", "status", "due_at", "created_at"]:
        op.create_index(f"ix_document_assignments_{column}", "document_assignments", [column])

    op.create_table(
        "document_comments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "document_attachments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("storage_provider", sa.String(length=30), nullable=False),
        sa.Column("storage_key", sa.String(length=1000), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id")),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=120), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "email_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("log_key", sa.String(length=255), nullable=False, unique=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id")),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("recipient_user_id", sa.String(length=36), sa.ForeignKey("users.id")),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("provider_response", sa.Text()),
        sa.Column("due_at_snapshot", sa.DateTime(timezone=True)),
        sa.Column("scheduled_for_date", sa.String(length=30)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in ["log_key", "event_type", "document_id", "assignment_id", "recipient_user_id", "recipient_email", "status", "due_at_snapshot", "scheduled_for_date", "created_at"]:
        op.create_index(f"ix_email_logs_{column}", "email_logs", [column], unique=column == "log_key")


def downgrade() -> None:
    for table in ["email_logs", "system_settings", "notifications", "document_attachments", "document_comments", "document_assignments", "documents", "users", "departments"]:
        op.drop_table(table)
