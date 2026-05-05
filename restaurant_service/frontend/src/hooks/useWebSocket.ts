import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config';

type MessageHandler = (data: any) => void;

export const useWebSocket = () => {
  const { authToken, user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!user || !authToken) return;

    const maxReconnectAttempts = 5;
    const baseDelay = 3000;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const wsUrl = `${API_CONFIG.WS_BASE_URL}/ws?token=${authToken}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttemptRef.current = 0;
        handlersRef.current.forEach(h => h({ type: 'ws_status', connected: true }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlersRef.current.forEach(h => h(data));
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        handlersRef.current.forEach(h => h({ type: 'ws_status', connected: false }));

        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = baseDelay * Math.pow(2, reconnectAttemptRef.current);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current++;
            connect();
          }, delay);
        } else {
          console.log('Max reconnect attempts reached');
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [user, authToken]);

  return { addHandler };
};