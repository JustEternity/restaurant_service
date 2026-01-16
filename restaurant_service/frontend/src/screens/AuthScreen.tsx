import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config';
import styles from '../design/AuthScreenStyles';

type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

type AuthScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Auth'>;

type Props = {
  navigation: AuthScreenNavigationProp;
};

export default function AuthScreen({ navigation }: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { login: authLogin, register: authRegister } = useAuth();


  const handleLogin = async () => {
    if (!login.trim() || !password.trim()) {
      setError('Пожалуйста, заполните все поля');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    setLocalLoading(true);
    setError('');

    try {
      const result = await authLogin(login, password);

      if (result.success) {
        console.log('Успешный вход:', result.user?.role);
      } else {
        setError(result.error || 'Ошибка входа');
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
      setError('Произошла ошибка. Проверьте подключение к серверу.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !login.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Пожалуйста, заполните все поля');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLocalLoading(true);
    setError('');

    try {
      const result = await authRegister(name, login, password, 'admin');

      if (result.success) {
        Alert.alert(
          'Успешная регистрация!',
          'Ваш аккаунт создан. Теперь вы можете войти в систему.',
          [{ text: 'OK' }]
        );
        setIsRegisterMode(false);
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error || 'Ошибка регистрации');
      }
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      setError('Произошла ошибка регистрации');
    } finally {
      setLocalLoading(false);
    }
  };

  const quickLogin = (testLogin: string, testPassword:string) => {
    setLogin(testLogin);
    setPassword(testPassword);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Заголовок */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>🍽️</Text>
          </View>
          <Text style={styles.title}>Restaurant service</Text>
          <Text style={styles.subtitle}>
            {isRegisterMode ? 'Регистрация' : 'Вход в систему'}
          </Text>
        </View>

        {/* Форма */}
        <View style={styles.form}>
          {isRegisterMode && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Имя</Text>
              <TextInput
                style={styles.input}
                placeholder="Введите ваше имя"
                placeholderTextColor="#95A5A6"
                value={name}
                onChangeText={setName}
                editable={!localLoading}
              />
            </View>
          )}

          {/* Поле Логин */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Логин</Text>
            <TextInput
              style={styles.input}
              placeholder="Введите логин"
              placeholderTextColor="#95A5A6"
              value={login}
              onChangeText={setLogin}
              autoCapitalize="none"
              editable={!localLoading}
            />
          </View>

          {/* Поле Пароль */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              style={styles.input}
              placeholder="Введите пароль (мин. 6 символов)"
              placeholderTextColor="#95A5A6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!localLoading}
            />
          </View>

          {isRegisterMode && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Подтверждение пароля</Text>
              <TextInput
                style={styles.input}
                placeholder="Повторите пароль"
                placeholderTextColor="#95A5A6"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!localLoading}
              />
            </View>
          )}

          {/* Сообщение об ошибке */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Кнопка входа/регистрации */}
          <TouchableOpacity
            style={[styles.loginButton, localLoading && styles.loginButtonDisabled]}
            onPress={isRegisterMode ? handleRegister : handleLogin}
            disabled={localLoading}
            activeOpacity={0.8}
          >
            {localLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>
                {isRegisterMode ? 'Зарегистрироваться' : 'Войти'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Переключение между входом и регистрацией */}
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => {
              setIsRegisterMode(!isRegisterMode);
              setError('');
            }}
            disabled={localLoading}
          >
            <Text style={styles.toggleButtonText}>
              {isRegisterMode
                ? 'Уже есть аккаунт? Войти'
                : 'Нет аккаунта? Зарегистрироваться'}
            </Text>
          </TouchableOpacity>

          {/* Быстрый вход для тестирования*/}
          {__DEV__ && !isRegisterMode && (
            <View style={styles.testContainer}>
              <Text style={styles.testTitle}>Тестовые пользователи:</Text>
              <View style={styles.testButtons}>
                <TouchableOpacity
                  style={[styles.testButton, styles.testButtonAdmin]}
                  onPress={() => quickLogin('admin2', '123456')}
                >
                  <Text style={styles.testButtonText}>👑 Админ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.testButton, styles.testButtonWaiter]}
                  onPress={() => quickLogin('waiter', '123456')}
                >
                  <Text style={styles.testButtonText}>👨‍💼 Официант</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.testButton, styles.testButtonChef]}
                  onPress={() => quickLogin('cook', '123456')}
                >
                  <Text style={styles.testButtonText}>👨‍🍳 Повар</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}