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

  const HEARTBEAT_INTERVAL = 10000;
  const HEARTBEAT_TIMEOUT = 20000;

  const lastReadyToastRef = useRef(0);
  const TOAST_COOLDOWN = 3000;

  const insets = useSafeAreaInsets();

  const startHeartbeat = () => {
    stopHeartbeat();

    heartbeatIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;

      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const now = Date.now();
      if (now - lastPongRef.current > HEARTBEAT_TIMEOUT) {
        console.log("Heartbeat timeout → reconnect WebSocket");
        ws.close();
        return;
      }

      ws.send(JSON.stringify({ type: "ping" }));
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  useEffect(() => {
    if (!user || !authToken) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopHeartbeat();
      return;
    }

    const maxReconnectAttempts = 5;
    const baseDelay = 3000;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const wsUrl = `${API_CONFIG.WS_BASE_URL}/ws?token=${authToken}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected");
        reconnectAttemptRef.current = 0;
        lastPongRef.current = Date.now();
        startHeartbeat();

        handlersRef.current.forEach(h => h({ type: "ws_status", connected: true }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "pong") {
            lastPongRef.current = Date.now();
            return;
          }

          if (data.type === "plate_ready") {
            const now = Date.now();
            if (now - lastReadyToastRef.current > TOAST_COOLDOWN) {
              lastReadyToastRef.current = now;


              Toast.show(data.message || "Блюдо готово к подаче", {
                duration: Toast.durations.SHORT,
                position: Toast.positions.TOP,
                containerStyle: {
                  marginTop: insets.top + 30,
                },
                shadow: true,
                animation: true,
                backgroundColor: "#2ecc71",
                textColor: "#fff",
                opacity: 1,
              });
            }
          }

          handlersRef.current.forEach(h => h(data));
        } catch (e) {
          console.error("WebSocket parse error:", e);
        }
      };

      wsRef.current.onerror = (err) => console.error("WebSocket error:", err);

      wsRef.current.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        stopHeartbeat();
        handlersRef.current.forEach(h => h({ type: "ws_status", connected: false }));

        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = baseDelay * Math.pow(2, reconnectAttemptRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current++;
            connect();
          }, delay);
        } else {
          console.log("Max reconnect attempts reached");
        }
      };
    };

    connect();

    return () => {
      stopHeartbeat();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [user, authToken]);

  return (
    <WebSocketContext.Provider value={{ addHandler }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};
