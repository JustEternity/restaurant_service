import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import styles from '../design/ProfileScreenStyles';

const ROLE_COLORS = {
  chef: '#FF6B6B',
  waiter: '#4ECDC4',
  admin: '#45B7D1',
};

const ProfileScreen = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Вы уверены, что хотите выйти?',
      [
        {text: 'Отмена', style: 'cancel',},
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: () => logout(),
        },
      ],
      { cancelable: true }
    );
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'chef':
        return '👨‍🍳 Повар';
      case 'waiter':
        return '👨‍💼 Официант';
      case 'admin':
        return '👨‍💻 Администратор';
      default:
        return role;
    }
  };

  const headerBackgroundColor = ROLE_COLORS[user?.role as keyof typeof ROLE_COLORS] || '#FF6B6B';

  return (
    <SafeAreaView style={styles.container}>
      {/* Шапка профиля */}
      <View style={[styles.header, { backgroundColor: headerBackgroundColor }]}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0) || 'П'}
            </Text>
          </View>
        </View>

        <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>
        <Text style={styles.role}>{getRoleDisplayName(user?.role || '')}</Text>
      </View>

      {/* Кнопка выхода */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default ProfileScreen;