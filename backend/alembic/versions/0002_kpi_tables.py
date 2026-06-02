"""add kpi tables

Revision ID: 0002_kpi_tables
Revises: 0001_initial_schema
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_kpi_tables"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "kpi_indicators",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("department_id", sa.String(length=36), sa.ForeignKey("departments.id")),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
    )
    for column in ["number", "name", "department_id", "is_active"]:
        op.create_index(f"ix_kpi_indicators_{column}", "kpi_indicators", [column])

    op.create_table(
        "kpi_periods",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("month", "year", name="uq_kpi_periods_month_year"),
    )
    for column in ["month", "year", "status", "created_by"]:
        op.create_index(f"ix_kpi_periods_{column}", "kpi_periods", [column])

    op.create_table(
        "kpi_results",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("period_id", sa.String(length=36), sa.ForeignKey("kpi_periods.id"), nullable=False),
        sa.Column("indicator_id", sa.String(length=36), sa.ForeignKey("kpi_indicators.id"), nullable=False),
        sa.Column("department_id", sa.String(length=36), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("percentage", sa.Float()),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("updated_by", sa.String(length=36), sa.ForeignKey("users.id")),
        *timestamps(),
        sa.UniqueConstraint("period_id", "indicator_id", "department_id", name="uq_kpi_results_period_indicator_department"),
    )
    for column in ["period_id", "indicator_id", "department_id", "status", "updated_by"]:
        op.create_index(f"ix_kpi_results_{column}", "kpi_results", [column])


def downgrade() -> None:
    op.drop_table("kpi_results")
    op.drop_table("kpi_periods")
    op.drop_table("kpi_indicators")
