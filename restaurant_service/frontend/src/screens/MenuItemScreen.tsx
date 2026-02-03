import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import styles from '../design/MenuItemScreenStyles'

const MenuItemDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { authToken, user } = useAuth();
  const { itemId } = route.params as { itemId: number };

  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadItem();
  }, [itemId]);

  const loadItem = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setItem(data);
    } catch (error) {
      console.error('Ошибка загрузки деталей блюда:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить информацию о блюде');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadItem();
  };

  const handleEdit = () => {
    if (!isAdmin) {
      Alert.alert('Доступ запрещен', 'Только администратор может редактировать позиции');
      return;
    }

    Alert.alert(
      'Редактировать',
      `Редактирование "${item.name}" будет реализовано в следующем этапе`,
      [{ text: 'OK' }]
    );
  };

  const handleDelete = () => {
    if (!isAdmin) return;

    Alert.alert(
      'Удалить позицию',
      `Вы уверены, что хотите удалить "${item.name}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: deleteItem
        }
      ]
    );
  };

  const deleteItem = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      Alert.alert('Успешно', 'Позиция удалена');
      navigation.goBack();
    } catch (error) {
      console.error('Ошибка удаления:', error);
      Alert.alert('Ошибка', 'Не удалось удалить позицию');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={60} color="#ccc" />
        <Text style={styles.emptyText}>Блюдо не найдено</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Вернуться назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Изображение блюда */}
      {item.photo ? (
        <Image
          source={{ uri: item.photo }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.image, styles.noImage]}>
          <Ionicons name="fast-food-outline" size={80} color="#999" />
          <Text style={styles.noImageText}>Нет изображения</Text>
        </View>
      )}

      <View style={styles.content}>
        {/* Заголовок */}
        <View style={styles.header}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.price}>{item.price} ₽</Text>
        </View>

        {/* Категория */}
        <View style={styles.categoryContainer}>
          <Ionicons name="list-outline" size={16} color="#666" />
          <Text style={styles.category}>{item.category_name}</Text>
        </View>

        {/* Статус доступности */}
        <View style={[
          styles.availabilityContainer,
          item.is_available ? styles.available : styles.unavailable
        ]}>
          <Ionicons
            name={item.is_available ? "checkmark-circle" : "close-circle"}
            size={16}
            color={item.is_available ? "#2ecc71" : "#e74c3c"}
          />
          <Text style={[
            styles.availabilityText,
            { color: item.is_available ? "#2ecc71" : "#e74c3c" }
          ]}>
            {item.is_available ? "Доступно" : "Не доступно"}
          </Text>
        </View>

        {/* Описание */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Описание</Text>
          <Text style={styles.description}>
            {item.description || 'Описание отсутствует'}
          </Text>
        </View>

        {/* Кнопки действий (только для админа) */}
        {isAdmin && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={handleEdit}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Редактировать</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Удалить</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default MenuItemDetailScreen;