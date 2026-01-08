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

const ProfileScreen = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Вы уверены, что хотите выйти?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Шапка профиля */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0) || 'П'}
              </Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>
          <Text style={styles.role}>{getRoleDisplayName(user?.role || '')}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Информационная секция */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Основная информация</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={20} color="#6C757D" />
              <Text style={styles.infoLabel}>Имя:</Text>
              <Text style={styles.infoValue}>{user?.name}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={20} color="#6C757D" />
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="restaurant-outline" size={20} color="#6C757D" />
              <Text style={styles.infoLabel}>ID ресторана:</Text>
              <Text style={styles.infoValue}>{user?.restaurantId || 'rest_001'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="shield-outline" size={20} color="#6C757D" />
              <Text style={styles.infoLabel}>Роль:</Text>
              <Text style={styles.infoValue}>{getRoleDisplayName(user?.role || '')}</Text>
            </View>
          </View>
        </View>


        {/* Кнопка выхода */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        {/* Версия приложения */}
        <Text style={styles.version}>Версия 1.0.0 • Restaurant Helper</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileScreen;