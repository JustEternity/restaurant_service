import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config';
import api, { setLogoutHandler, setRefreshAccessTokenHandler } from '../services/api';
import { WebSocketProvider, useWebSocket } from './WebSocketContext';
import { Alert, InteractionManager } from 'react-native';

const AuthContext = createContext();

const ForceLogoutSubscriber = ({ onForceLogout }) => {
  const { addHandler } = useWebSocket();

  useEffect(() => {
    const unsubscribe = addHandler((data) => {
      if (data?.type !== "force_logout") return;

      const reason = String(data.reason || "").trim().toLowerCase();

      let reasonText = "Сеанс завершён. Войдите заново.";

      if (reason === "password_changed") {
        reasonText = "Ваш пароль был изменён администратором. Войдите с новым паролем.";
      } else if (reason === "role_or_status_changed") {
        reasonText = "Ваши права доступа были изменены. Войдите заново.";
      }

      Alert.alert("Уведомление", reasonText, [{ text: "OK" }]);

      setTimeout(() => onForceLogout(), 200);
    });

    return unsubscribe;
  }, [addHandler, onForceLogout]);

  return null;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const logoutTimerRef = useRef(null);

  const logout = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        API_CONFIG.STORAGE_KEYS.AUTH_TOKEN,
        API_CONFIG.STORAGE_KEYS.USER_DATA
      ]);
    } catch (e) {}

    setUser(null);
    setAuthToken(null);
    setIsAuthenticated(false);

    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLogoutHandler(logout);
    return () => setLogoutHandler(null);
  }, [logout]);

  const setTokenWithExpiry = useCallback(async (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = payload.exp * 1000;
      const currentTime = Date.now();
      const delay = expiryTime - currentTime - 5000;

      if (delay > 0) {
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);

        logoutTimerRef.current = setTimeout(async () => {
          console.log("Access token expired → refreshing silently...");
          await refreshAccessTokenRef.current();
        }, delay);
      } else {
        await refreshAccessTokenRef.current();
        return;
      }

      setAuthToken(token);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Ошибка декодирования токена:', error);
      logout();
    }
  }, [logout]);

  const refreshAccessTokenRef = useRef(null);

  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await api.post('/refresh-token');
      const { access_token } = response.data;

      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, access_token);
      await setTokenWithExpiry(access_token);

      return access_token;
    } catch (error) {
      console.log("Не удалось обновить токен");
      logout();
      return null;
    }
  }, [logout, setTokenWithExpiry]);

  refreshAccessTokenRef.current = refreshAccessToken;

  useEffect(() => {
    setRefreshAccessTokenHandler(refreshAccessToken);
  }, [refreshAccessToken]);

  const restoreSession = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_DATA);
      const savedToken = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN);

      if (savedUser && savedToken) {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        await setTokenWithExpiry(savedToken);
      }
    } catch (error) {
      console.error('Ошибка восстановления сессии:', error);
    } finally {
      setIsLoading(false);
    }
  }, [setTokenWithExpiry]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = async (login, password) => {
    try {
      const response = await api.post('/auth/login-json', { login, password });
      const { access_token, user_id, role, name } = response.data;

      const userData = { id: user_id, login, role, name, is_available: true };

      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, access_token);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

      setUser(userData);
      await setTokenWithExpiry(access_token);

      return { success: true, user: userData };
    } catch (err) {
      console.log("LOGIN ERROR:", err.response?.data);

      if (err.response?.status === 401) {
        return { success: false, error: "Неверный логин или пароль" };
      }

      if (err.response?.status === 403) {
        return { success: false, error: "Пользователь заблокирован" };
      }

      if (err.response?.data?.detail) {
        return { success: false, error: err.response.data.detail };
      }

      return { success: false, error: "Ошибка подключения к серверу" };
    }
  };

  const hasRole = (role) => user?.role === role;

  const hasPermission = (permission) => {
    const rolePermissions = {
      admin: ['manage_users', 'view_reports', 'configure_system', 'view_all_orders', 'manage_menu'],
      waiter: ['create_order', 'view_tables', 'process_payment', 'view_own_orders'],
      cook: ['view_orders', 'update_order_status', 'view_menu'],
    };
    return rolePermissions[user?.role]?.includes(permission) || false;
  };

  const value = {
    user,
    isLoading,
    isAuthenticated,
    authToken,
    login,
    logout,
    hasRole,
    hasPermission,
  };

  return (
    <AuthContext.Provider value={value}>
      <WebSocketProvider authToken={authToken} user={user} onForceLogout={logout}>
        <ForceLogoutSubscriber onForceLogout={logout} />
        {children}
      </WebSocketProvider>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};