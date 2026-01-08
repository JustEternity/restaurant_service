import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Пожалуйста, заполните все поля');
      return;
    }

    setLocalLoading(true);
    setError('');

    try {
      const result = await login(email, password);

      if (result.success) {
        console.log('Успешный вход:', result.user?.role);
      } else {
        setError(result.error || 'Ошибка входа');
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
      setError('Произошла ошибка. Попробуйте еще раз.');
    } finally {
      setLocalLoading(false);
    }
  };

  const quickLogin = (role: 'chef' | 'waiter' | 'admin') => {
    let testEmail = '';
    switch(role) {
      case 'chef':
        testEmail = 'chef@test.com';
        break;
      case 'waiter':
        testEmail = 'waiter@test.com';
        break;
      case 'admin':
        testEmail = 'admin@test.com';
        break;
    }
    setEmail(testEmail);
    setPassword('123456');
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
          <Text style={styles.title}>Restaurant Helper</Text>
          <Text style={styles.subtitle}>Тестовый режим</Text>
        </View>

        {/* Форма */}
        <View style={styles.form}>
          {/* Поле Email */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Логин (email)</Text>
            <TextInput
              style={styles.input}
              placeholder="login@test.com"
              placeholderTextColor="#95A5A6"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!localLoading}
            />
          </View>

          {/* Поле Пароль */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#95A5A6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!localLoading}
            />
          </View>

          {/* Сообщение об ошибке */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Кнопка входа */}
          <TouchableOpacity
            style={[styles.loginButton, localLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={localLoading}
            activeOpacity={0.8}
          >
            {localLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Войти</Text>
            )}
          </TouchableOpacity>

          {/* Быстрый вход для тестирования*/}
          <View style={styles.testContainer}>
            <Text style={styles.testTitle}>Быстрый тестовый вход:</Text>
            <View style={styles.testButtons}>
              <TouchableOpacity
                style={[styles.testButton, styles.testButtonChef]}
                onPress={() => quickLogin('chef')}
              >
                <Text style={styles.testButtonText}>👨‍🍳 Повар</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testButton, styles.testButtonWaiter]}
                onPress={() => quickLogin('waiter')}
              >
                <Text style={styles.testButtonText}>👨‍💼 Официант</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testButton, styles.testButtonAdmin]}
                onPress={() => quickLogin('admin')}
              >
                <Text style={styles.testButtonText}>👨‍💻 Админ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}