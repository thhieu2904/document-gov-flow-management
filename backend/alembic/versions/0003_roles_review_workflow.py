"""add role scopes and assignment review workflow

Revision ID: 0003_roles_review_workflow
Revises: 0002_kpi_tables
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_roles_review_workflow"
down_revision = "0002_kpi_tables"
branch_labels = None
depends_on = None


SUPERADMIN_EMAILS = ("thhieu2904@gmail.com", "nguyenvanquang.vms@gmail.com")
FALLBACK_OWNER_EMAIL = "nguyenvanquang.vms@gmail.com"
EXAMPLE_MANAGER_EMAIL = "manager@example.com"


def upgrade() -> None:
    op.create_table(
        "assignment_reviews",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("assignment_id", sa.String(length=36), sa.ForeignKey("document_assignments.id"), nullable=False),
        sa.Column("reviewer_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in ["assignment_id", "reviewer_id", "action", "created_at"]:
        op.create_index(f"ix_assignment_reviews_{column}", "assignment_reviews", [column])

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            update users
            set role = 'superadmin', department_id = null
            where lower(email) in :emails
            """
        ).bindparams(sa.bindparam("emails", expanding=True)),
        {"emails": SUPERADMIN_EMAILS},
    )
    bind.execute(sa.text("update document_assignments set status = 'approved' where status = 'completed'"))

    fallback_owner_id = bind.execute(
        sa.text("select id from users where lower(email) = :email"),
        {"email": FALLBACK_OWNER_EMAIL},
    ).scalar()
    example_manager_id = bind.execute(
        sa.text("select id from users where lower(email) = :email"),
        {"email": EXAMPLE_MANAGER_EMAIL},
    ).scalar()

    if fallback_owner_id:
        bind.execute(
            sa.text("update documents set created_by = :owner_id where department_id is null"),
            {"owner_id": fallback_owner_id},
        )

    if fallback_owner_id and example_manager_id:
        for table, column in [
            ("documents", "created_by"),
            ("document_assignments", "assigned_by"),
            ("document_assignments", "assignee_id"),
            ("document_comments", "user_id"),
            ("document_attachments", "uploaded_by"),
            ("notifications", "user_id"),
            ("kpi_periods", "created_by"),
            ("kpi_results", "updated_by"),
        ]:
            bind.execute(
                sa.text(f"update {table} set {column} = :owner_id where {column} = :example_id"),
                {"owner_id": fallback_owner_id, "example_id": example_manager_id},
            )
        bind.execute(
            sa.text("update email_logs set recipient_user_id = null where recipient_user_id = :example_id"),
            {"example_id": example_manager_id},
        )
        bind.execute(sa.text("delete from users where id = :example_id"), {"example_id": example_manager_id})

    department_ids = bind.execute(
        sa.text("select id from departments where is_active = true order by created_at, name")
    ).scalars().all()
    if department_ids:
        manager_ids = bind.execute(
            sa.text(
                """
                select id from users
                where role = 'manager'
                  and department_id is null
                  and lower(email) not in :emails
                order by created_at, email
                """
            ).bindparams(sa.bindparam("emails", expanding=True)),
            {"emails": (*SUPERADMIN_EMAILS, EXAMPLE_MANAGER_EMAIL)},
        ).scalars().all()
        for index, manager_id in enumerate(manager_ids):
            bind.execute(
                sa.text("update users set department_id = :department_id where id = :manager_id"),
                {"department_id": department_ids[index % len(department_ids)], "manager_id": manager_id},
            )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("update document_assignments set status = 'completed' where status = 'approved'"))
    bind.execute(sa.text("update document_assignments set status = 'in_progress' where status in ('submitted', 'returned')"))
    bind.execute(
        sa.text(
            """
            update users
            set role = 'manager'
            where lower(email) in :emails
            """
        ).bindparams(sa.bindparam("emails", expanding=True)),
        {"emails": SUPERADMIN_EMAILS},
    )
    op.drop_table("assignment_reviews")
