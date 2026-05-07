import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config';
import api, { setLogoutHandler } from '../services/api';

const AuthContext = createContext();

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
        API_CONFIG.STORAGE_KEYS.USER_DATA,
        API_CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
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
      const delay = expiryTime - currentTime;

      if (delay > 0) {
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = setTimeout(() => {
          console.log('Токен истёк, автоматический выход');
          logout();
        }, delay);
      } else {
        logout();
        return;
      }

      setAuthToken(token);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Ошибка декодирования токена:', error);
      logout();
    }
  }, [logout]);

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

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);

  const login = async (login, password) => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/login-json', { login, password });
      const { access_token, user_id, role, name } = response.data;

      const userData = {
        id: user_id,
        login,
        role,
        name,
        is_available: true,
      };

      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, access_token);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

      setUser(userData);
      await setTokenWithExpiry(access_token);

      return { success: true, user: userData };
    } catch (error) {
      console.error('Ошибка входа:', error);
      return { success: false, error: error.response?.data?.detail || error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name, login, password, role = 'admin') => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/register', { name, login, password, role });
      const { access_token, user_id, role: userRole, name: userName } = response.data;

      const userData = {
        id: user_id,
        login,
        role: userRole,
        name: userName,
        is_available: true,
      };

      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, access_token);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

      setUser(userData);
      await setTokenWithExpiry(access_token);

      return { success: true, user: userData };
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const getAllUsers = async () => {
    try {
      const response = await api.get('/users/');
      return { success: true, users: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  };

  const getUserById = async (userId) => {
    try {
      const response = await api.get(`/users/${userId}`);
      return { success: true, user: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  };

  const createUser = async (userData) => {
    try {
      const response = await api.post('/users/', userData);
      return { success: true, user: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  };

  const updateUser = async (userId, userData) => {
    try {
      const response = await api.put(`/users/${userId}`, userData);
      return { success: true, user: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  };

  const deleteUser = async (userId) => {
    try {
      const response = await api.delete(`/users/${userId}`);
      return { success: true, message: response.data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  };

  const updateLocalUser = async (updates) => {
    try {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
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
    register,
    updateLocalUser,
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    hasRole,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};