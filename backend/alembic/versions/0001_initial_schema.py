"""initial assignment workflow schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-16
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
        sa.Column("unit_type", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_departments_name", "departments", ["name"])
    op.create_index("ix_departments_unit_type", "departments", ["unit_type"])
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
    op.create_index("ix_users_supabase_user_id", "users", ["supabase_user_id"], unique=True)
    op.create_index("ix_users_full_name", "users", ["full_name"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index("ix_users_department_id", "users", ["department_id"])
    op.create_index("ix_users_is_active", "users", ["is_active"])

    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("code", sa.String(length=120)),
        sa.Column("arrival_number", sa.String(length=80)),
        sa.Column("issuing_agency", sa.String(length=255)),
        sa.Column("content", sa.Text()),
        sa.Column("document_date", sa.Date()),
        sa.Column("received_date", sa.Date()),
        sa.Column("issued_date", sa.Date()),
        sa.Column("due_date", sa.Date()),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("owner_department_id", sa.String(length=36), sa.ForeignKey("departments.id")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_by", sa.String(length=36), sa.ForeignKey("users.id")),
        sa.Column("delete_reason", sa.Text()),
        *timestamps(),
    )
    for column in [
        "document_type",
        "title",
        "code",
        "arrival_number",
        "issuing_agency",
        "due_date",
        "priority",
        "status",
        "created_by",
        "owner_department_id",
        "deleted_at",
    ]:
        op.create_index(f"ix_documents_{column}", "documents", [column])

    op.create_table(
        "document_assignments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("parent_assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("sender_user_id", sa.String(length=36), sa.ForeignKey("users.id")),
        sa.Column("sender_department_id", sa.String(length=36), sa.ForeignKey("departments.id")),
        sa.Column("receiver_user_id", sa.String(length=36), sa.ForeignKey("users.id")),
        sa.Column("receiver_department_id", sa.String(length=36), sa.ForeignKey("departments.id")),
        sa.Column("assignment_role", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("action_type", sa.String(length=60), nullable=False),
        sa.Column("instruction", sa.Text()),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("pending_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("returned_at", sa.DateTime(timezone=True)),
        *timestamps(),
    )
    for column in [
        "document_id",
        "parent_assignment_id",
        "sender_user_id",
        "sender_department_id",
        "receiver_user_id",
        "receiver_department_id",
        "assignment_role",
        "status",
        "action_type",
        "priority",
        "due_date",
        "pending_at",
    ]:
        op.create_index(f"ix_document_assignments_{column}", "document_assignments", [column])

    op.create_table(
        "document_comments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_document_comments_document_id", "document_comments", ["document_id"])
    op.create_index("ix_document_comments_assignment_id", "document_comments", ["assignment_id"])
    op.create_index("ix_document_comments_user_id", "document_comments", ["user_id"])

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
    op.create_index("ix_document_attachments_document_id", "document_attachments", ["document_id"])
    op.create_index("ix_document_attachments_assignment_id", "document_attachments", ["assignment_id"])
    op.create_index("ix_document_attachments_uploaded_by", "document_attachments", ["uploaded_by"])

    op.create_table(
        "document_history_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id")),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id")),
        sa.Column("action_type", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("extra", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_document_history_logs_document_id", "document_history_logs", ["document_id"])
    op.create_index("ix_document_history_logs_assignment_id", "document_history_logs", ["assignment_id"])
    op.create_index("ix_document_history_logs_user_id", "document_history_logs", ["user_id"])
    op.create_index("ix_document_history_logs_action_type", "document_history_logs", ["action_type"])

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
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_document_id", "notifications", ["document_id"])
    op.create_index("ix_notifications_assignment_id", "notifications", ["assignment_id"])
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])


def downgrade() -> None:
    for table_name in [
        "notifications",
        "document_history_logs",
        "document_attachments",
        "document_comments",
        "document_assignments",
        "documents",
        "users",
        "departments",
    ]:
        op.drop_table(table_name)
