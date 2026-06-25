import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { API_CONFIG } from '../config';
import Toast from 'react-native-root-toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MessageHandler = (data: any) => void;

interface WebSocketContextType {
  addHandler: (handler: MessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  authToken: string | null;
  user: { id: number } | null;
  onForceLogout?: () => void;
}

export const WebSocketProvider = ({ children, authToken, user }: WebSocketProviderProps) => {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const lastReadyToastRef = useRef(0);
  const isConnectingRef = useRef(false);

  const HEARTBEAT_INTERVAL = 15000;
  const HEARTBEAT_TIMEOUT = 30000;
  const TOAST_COOLDOWN = 3000;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_DELAY = 3000;

  const insets = useSafeAreaInsets();

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  useEffect(() => {
    if (!user || !authToken) {
      wsRef.current?.close();
      wsRef.current = null;
      stopHeartbeat();
      return;
    }

    const connect = () => {
      if (
        isConnectingRef.current ||
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      ) return;

      isConnectingRef.current = true;

      const wsUrl = `${API_CONFIG.WS_BASE_URL}/ws?token=${authToken}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        console.log('WebSocket connected');
        reconnectAttemptRef.current = 0;
        lastPongRef.current = Date.now();

        stopHeartbeat();
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;

          if (Date.now() - lastPongRef.current > HEARTBEAT_TIMEOUT) {
            console.log('Heartbeat timeout → reconnect');
            ws.close();
            return;
          }

          ws.send(JSON.stringify({ type: 'ping' }));
        }, HEARTBEAT_INTERVAL);

        handlersRef.current.forEach(h => h({ type: 'ws_status', connected: true }));
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          console.error("WS JSON parse error:", e, event.data);
          return;
        }

        try {
          if (data.type === 'pong') {
            lastPongRef.current = Date.now();
            return;
          }

          if (data.type === 'plate_ready') {
            const now = Date.now();
            console.log("WS RAW:", event.data);
            console.log("WS PARSED:", data);
            if (now - lastReadyToastRef.current > TOAST_COOLDOWN) {
              lastReadyToastRef.current = now;
              const msg = data.message
                ? `Заказ #${data.order_id}: ${data.message}`
                : 'Блюдо готово к подаче';
              Toast.show(msg, {
                duration: 5000,
                position: Toast.positions.TOP,
                containerStyle: { marginTop: 0 },
                shadow: true,
                animation: true,
                backgroundColor: '#2ecc71',
                textColor: '#fff',
                opacity: 1,
              });
            }
          }

          if (data.type === 'plate_cancelled') {
            const now = Date.now();
            if (now - lastReadyToastRef.current > TOAST_COOLDOWN) {
              lastReadyToastRef.current = now;
              const msg = data.message
                ? `Заказ #${data.order_id}: ${data.message}`
                : 'Блюдо невозможно приготовить';
              Toast.show(msg, {
                duration: 5000,
                position: Toast.positions.TOP,
                containerStyle: { marginTop: 0 },
                shadow: true,
                animation: true,
                backgroundColor: '#e74c3c',
                textColor: '#fff',
                opacity: 1,
              });
            }
          }

          handlersRef.current.forEach(h => h(data));
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      };

      ws.onerror = (err) => {
        isConnectingRef.current = false;
        console.error('WebSocket error:', err);
      };

      ws.onclose = (event) => {
        isConnectingRef.current = false;
        console.log('WebSocket closed:', event.code, event.reason);
        stopHeartbeat();
        handlersRef.current.forEach(h => h({ type: 'ws_status', connected: false }));

        if (event.code === 1000) return;

        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_DELAY * Math.pow(2, reconnectAttemptRef.current);
          console.log(`Reconnect attempt ${reconnectAttemptRef.current + 1} in ${delay}ms`);
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
      stopHeartbeat();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [user?.id, authToken]);

  return (
    <WebSocketContext.Provider value={{ addHandler }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWebSocket must be used within a WebSocketProvider');
  return context;
};