from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import and_, case, func, or_, select, update

from app.api.dependencies import CurrentUser, DbSession
from app.models.chat_message import ChatMessage
from app.models.user import User

router = APIRouter()


def message_to_dict(message: ChatMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "recipient_id": message.recipient_id,
        "body": message.body,
        "created_at": message.created_at.isoformat(),
        "read_at": message.read_at.isoformat() if message.read_at else None,
    }


def chat_user(db: DbSession, user_id: int, current_user_id: int) -> User:
    user = db.scalar(select(User).where(User.id == user_id, User.active.is_(True)))
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado ou inativo.")
    if user.id == current_user_id:
        raise HTTPException(status_code=422, detail="Selecione outro usuário para conversar.")
    return user


@router.get("/contacts")
def list_contacts(db: DbSession, current_user: CurrentUser) -> list[dict[str, Any]]:
    contacts = list(
        db.scalars(
            select(User)
            .where(User.active.is_(True), User.id != current_user.id)
            .order_by(User.full_name, User.id)
        )
    )
    other_user_id = case(
        (ChatMessage.sender_id == current_user.id, ChatMessage.recipient_id),
        else_=ChatMessage.sender_id,
    )
    ranked_messages = (
        select(
            ChatMessage.id.label("message_id"),
            other_user_id.label("other_user_id"),
            func.row_number().over(
                partition_by=other_user_id,
                order_by=(ChatMessage.created_at.desc(), ChatMessage.id.desc()),
            ).label("position"),
        )
        .where(
            or_(
                ChatMessage.sender_id == current_user.id,
                ChatMessage.recipient_id == current_user.id,
            )
        )
        .subquery()
    )
    last_messages = {
        other_id: message
        for message, other_id in db.execute(
            select(ChatMessage, ranked_messages.c.other_user_id)
            .join(ranked_messages, ranked_messages.c.message_id == ChatMessage.id)
            .where(ranked_messages.c.position == 1)
        )
    }
    unread_counts = {
        sender_id: count
        for sender_id, count in db.execute(
            select(ChatMessage.sender_id, func.count(ChatMessage.id))
            .where(
                ChatMessage.recipient_id == current_user.id,
                ChatMessage.read_at.is_(None),
            )
            .group_by(ChatMessage.sender_id)
        )
    }
    result: list[dict[str, Any]] = []
    for contact in contacts:
        last_message = last_messages.get(contact.id)
        result.append(
            {
                "id": contact.id,
                "username": contact.username,
                "full_name": contact.full_name,
                "role": contact.role.value,
                "unread_count": unread_counts.get(contact.id, 0),
                "last_message": last_message.body[:120] if last_message else "",
                "last_message_at": last_message.created_at.isoformat() if last_message else None,
                "last_sender_id": last_message.sender_id if last_message else None,
            }
        )
    result.sort(key=lambda item: item["full_name"])
    result.sort(key=lambda item: item["last_message_at"] or "", reverse=True)
    return result


@router.get("/messages/{user_id}")
def list_messages(
    user_id: int,
    db: DbSession,
    current_user: CurrentUser,
    limit: int = 100,
) -> list[dict[str, Any]]:
    chat_user(db, user_id, current_user.id)
    messages = list(
        db.scalars(
            select(ChatMessage)
            .where(
                or_(
                    and_(ChatMessage.sender_id == current_user.id, ChatMessage.recipient_id == user_id),
                    and_(ChatMessage.sender_id == user_id, ChatMessage.recipient_id == current_user.id),
                )
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(min(max(limit, 1), 200))
        )
    )
    db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.sender_id == user_id,
            ChatMessage.recipient_id == current_user.id,
            ChatMessage.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()
    return [message_to_dict(message) for message in reversed(messages)]


@router.post("/messages/{user_id}", status_code=201)
def send_message(
    user_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, Any]:
    recipient = chat_user(db, user_id, current_user.id)
    body = str(payload.get("body") or "").replace("\r\n", "\n").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Digite uma mensagem.")
    if len(body) > 2000:
        raise HTTPException(status_code=422, detail="A mensagem deve ter no máximo 2.000 caracteres.")
    message = ChatMessage(sender_id=current_user.id, recipient_id=recipient.id, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message_to_dict(message)
