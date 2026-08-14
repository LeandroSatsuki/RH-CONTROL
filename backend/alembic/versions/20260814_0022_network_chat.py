"""Add private network chat messages.

Revision ID: 20260814_0022
Revises: 20260814_0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260814_0022"
down_revision: str | None = "20260814_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_messages_sender_id", "chat_messages", ["sender_id"])
    op.create_index("ix_chat_messages_recipient_id", "chat_messages", ["recipient_id"])
    op.create_index(
        "ix_chat_messages_conversation_created",
        "chat_messages",
        ["sender_id", "recipient_id", "created_at"],
    )
    op.create_index(
        "ix_chat_messages_recipient_read",
        "chat_messages",
        ["recipient_id", "read_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_recipient_read", table_name="chat_messages")
    op.drop_index("ix_chat_messages_conversation_created", table_name="chat_messages")
    op.drop_index("ix_chat_messages_recipient_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_sender_id", table_name="chat_messages")
    op.drop_table("chat_messages")
