import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const UserRoles = {
  CHEF: 'chef',
  WAITER: 'waiter',
  ADMIN: 'admin'
};

const MOCK_USERS = {
  'chef@test.com': {
    id: '1',
    email: 'chef@test.com',
    role: UserRoles.CHEF,
    name: 'Иван Поваров',
    restaurantId: 'rest_001',
    permissions: ['view_orders', 'update_order_status', 'view_menu']
  },
  'waiter@test.com': {
    id: '2',
    email: 'waiter@test.com',
    role: UserRoles.WAITER,
    name: 'Анна Официантова',
    restaurantId: 'rest_001',
    permissions: ['create_order', 'view_tables', 'process_payment']
  },
  'admin@test.com': {
    id: '3',
    email: 'admin@test.com',
    role: UserRoles.ADMIN,
    name: 'Алексей Админов',
    restaurantId: 'rest_001',
    permissions: ['manage_users', 'view_reports', 'configure_system']
  }
};

const TEST_PASSWORD = '123456';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Восстановление сессии при загрузке приложения
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('@user_data');
      const savedToken = await AsyncStorage.getItem('@auth_token');

      if (savedUser && savedToken) {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Ошибка восстановления сессии:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Вход
  const login = async (email, password) => {
    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (MOCK_USERS[email] && password === TEST_PASSWORD) {
        const userData = MOCK_USERS[email];

        const mockToken = `mock_jwt_${Date.now()}_${userData.id}`;

        await AsyncStorage.setItem('@user_data', JSON.stringify(userData));
        await AsyncStorage.setItem('@auth_token', mockToken);

        setUser(userData);
        setIsAuthenticated(true);

        return { success: true, user: userData };
      } else {
        throw new Error('Неверный email или пароль');
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
      return {
        success: false,
        error: error.message || 'Ошибка аутентификации'
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Выход
  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(['@user_data', '@auth_token']);
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Ошибка выхода:', error);
    }
  };

  // Обновление пользователя
  const updateUser = async (updates) => {
    try {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      await AsyncStorage.setItem('@user_data', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
    }
  };

  // Проверка роли
  const hasRole = (role) => {
    return user?.role === role;
  };

  // Проверка разрешений
  const hasPermission = (permission) => {
    return user?.permissions?.includes(permission) || false;
  };

  // Контекст
  const value = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
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