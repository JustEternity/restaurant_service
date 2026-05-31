from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, status
from app.websocket.manager import manager
from app.core.security import decode_token
from app.db_models import User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.database import get_async_db

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_async_db)
):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    stmt = select(User).where(User.id == int(user_id)).options(selectinload(User.role_of_user))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    role_name = user.role_of_user.name if user.role_of_user else "unknown"

    await manager.connect(user.id, websocket, role=role_name)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
