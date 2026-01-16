import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, UserRoles } from '../config';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const savedUser = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_DATA);
      const savedToken = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN);

      if (savedUser && savedToken) {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setAuthToken(savedToken);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Ошибка восстановления сессии:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (login, password) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/login-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          username: login,
          password: password
        })
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);

        if (response.status === 401) {
          throw new Error('Неверный логин или пароль');
        } else if (response.status === 422) {
          throw new Error('Неправильный формат данных');
        } else {
          throw new Error(`Ошибка сервера: ${response.status}`);
        }
      }

      const data = await response.json();
      console.log('Success response:', data);

      const { access_token, user_id, role, name } = data;

      const userData = {
        id: user_id,
        login: login,
        role: role,
        name: name,
        is_available: true
      };

      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, access_token);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

      setAuthToken(access_token);
      setUser(userData);
      setIsAuthenticated(true);

      return { success: true, user: userData };
    } catch (error) {
      console.error('Ошибка входа:', error);
      return {
        success: false,
        error: error.message || 'Неверный логин или пароль'
      };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name, login, password, role = 'admin') => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          login,
          password,
          role
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const { access_token, user_id, role: userRole, name: userName } = data;

      const userData = {
        id: user_id,
        login: login,
        role: userRole,
        name: userName,
        is_available: true
      };

      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, access_token);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

      setAuthToken(access_token);
      setUser(userData);
      setIsAuthenticated(true);

      return { success: true, user: userData };
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      return {
        success: false,
        error: error.message || 'Ошибка регистрации'
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.multiRemove([
        API_CONFIG.STORAGE_KEYS.AUTH_TOKEN,
        API_CONFIG.STORAGE_KEYS.USER_DATA,
        API_CONFIG.STORAGE_KEYS.REFRESH_TOKEN
      ]);

      setUser(null);
      setAuthToken(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Ошибка выхода:', error);
    }
  };

  const updateUser = async (updates) => {
    try {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
    }
  };

  const hasRole = (role) => {
    return user?.role === role;
  };

  const hasPermission = (permission) => {
    const rolePermissions = {
      'admin': ['manage_users', 'view_reports', 'configure_system', 'view_all_orders', 'manage_menu'],
      'waiter': ['create_order', 'view_tables', 'process_payment', 'view_own_orders'],
      'cook': ['view_orders', 'update_order_status', 'view_menu']
    };

    return rolePermissions[user?.role]?.includes(permission) || false;
  };

  // Контекст
  const value = {
    user,
    isLoading,
    isAuthenticated,
    authToken,
    login,
    logout,
    register,
    updateUser,
    hasRole,
    hasPermission
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};