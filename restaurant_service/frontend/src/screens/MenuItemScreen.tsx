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
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/MenuItemScreenStyles';

import { getPhotoUrl } from '../utils/imageUrl';

interface MenuItemDetail {
  id: number;
  name: string;
  description: string;
  photo: string | null;
  price: number;
  category: number;
  is_available: boolean;
  category_name: string | null;
}

const MenuItemDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { itemId } = route.params as { itemId: number };

  const [item, setItem] = useState<MenuItemDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadItem();
  }, [itemId]);

  const loadItem = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/menu/${itemId}`);
      setItem(response.data);
    } catch (error) {
      console.error('Ошибка загрузки деталей блюда:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить информацию о блюде');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (!isAdmin) {
      Alert.alert('Доступ запрещен', 'Только администратор может редактировать позиции');
      return;
    }
    Alert.alert(
      'Редактировать',
      `Редактирование "${item?.name}" будет реализовано в следующем этапе`,
      [{ text: 'OK' }]
    );
  };

  const handleDelete = () => {
    if (!isAdmin) return;
    Alert.alert(
      'Удалить позицию',
      `Вы уверены, что хотите удалить "${item?.name}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: deleteItem }
      ]
    );
  };

  const deleteItem = async () => {
    try {
      await api.delete(`/menu/${itemId}`);
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
      {item.photo ? (
        <Image
          source={{ uri: getPhotoUrl(item.photo) ?? undefined }}
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
        <View style={styles.header}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.price}>{item.price} ₽</Text>
        </View>

        <View style={styles.categoryContainer}>
          <Ionicons name="list-outline" size={16} color="#666" />
          <Text style={styles.category}>{item.category_name}</Text>
        </View>

        <View style={[styles.availabilityContainer, item.is_available ? styles.available : styles.unavailable]}>
          <Ionicons
            name={item.is_available ? "checkmark-circle" : "close-circle"}
            size={16}
            color={item.is_available ? "#2ecc71" : "#e74c3c"}
          />
          <Text style={[styles.availabilityText, { color: item.is_available ? "#2ecc71" : "#e74c3c" }]}>
            {item.is_available ? "Доступно" : "Не доступно"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Описание</Text>
          <Text style={styles.description}>
            {item.description || 'Описание отсутствует'}
          </Text>
        </View>

        {isAdmin && (
          <View style={styles.detailActionsContainer}>
            <TouchableOpacity
              style={[styles.detailActionButton, styles.detailEditButton]}
              onPress={handleEdit}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.detailActionButtonText}>Редактировать</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.detailActionButton, styles.detailDeleteButton]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.detailActionButtonText}>Удалить</Text>
            </TouchableOpacity>

          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default MenuItemDetailScreen;