from fastapi import WebSocket
from typing import Dict, List, Set

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.user_roles: Dict[int, str] = {}

    async def connect(self, user_id: int, websocket: WebSocket, role: str = None):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        if role:
            self.user_roles[user_id] = role

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                self.user_roles.pop(user_id, None)

    async def send_personal_message(self, message: dict, user_id: int):
        """Отправить сообщение пользователю"""
        if user_id not in self.active_connections:
            return

        is_force = message.get("type") == "force_logout"

        for ws in list(self.active_connections[user_id]):
            try:
                await ws.send_json(message)
                if is_force:
                    await ws.close(code=4001, reason="force_logout")
            except Exception:
                pass

    async def broadcast_to_users(self, message: dict, user_ids: List[int]):
        for uid in user_ids:
            await self.send_personal_message(message, uid)

    async def broadcast_to_role(self, message: dict, role: str):
        for uid, r in self.user_roles.items():
            if r == role:
                await self.send_personal_message(message, uid)

manager = ConnectionManager()