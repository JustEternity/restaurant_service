import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/MenuItemScreenStyles';

interface Tag {
  id: number;
  name: string;
}

interface MenuItemDetail {
  id: number;
  name: string;
  description: string;
  photo: string | null;
  price: number;
  category: number;
  is_available: boolean;
  category_name: string | null;
  tags: Tag[];
}

const MenuItemDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { itemId } = route.params as { itemId: number };

  const [item, setItem] = useState<MenuItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [editTagsModalVisible, setEditTagsModalVisible] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadItem();
    loadAllTags();
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

  const loadAllTags = async () => {
    try {
      const response = await api.get('/tags/');
      setAllTags(response.data);
    } catch (error) {
      console.error('Ошибка загрузки тегов:', error);
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

  const openEditTags = () => {
    if (!item) return;
    setSelectedTagIds(new Set(item.tags.map(t => t.id)));
    setEditTagsModalVisible(true);
  };

  const toggleTag = (tagId: number) => {
    const newSet = new Set(selectedTagIds);
    if (newSet.has(tagId)) {
      newSet.delete(tagId);
    } else {
      newSet.add(tagId);
    }
    setSelectedTagIds(newSet);
  };

  const saveTags = async () => {
    if (!item) return;
    setSavingTags(true);
    try {
      const tagIds = Array.from(selectedTagIds);
      const response = await api.put(`/menu/${item.id}`, { tag_ids: tagIds });
      setItem(response.data);
      setEditTagsModalVisible(false);
      Alert.alert('Успешно', 'Теги обновлены');
    } catch (error: any) {
      Alert.alert('Ошибка', error.message);
    } finally {
      setSavingTags(false);
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
        <Image source={{ uri: item.photo }} style={styles.image} resizeMode="cover" />
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

        {item.tags && item.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Теги</Text>
            <View style={styles.tagsContainer}>
              {item.tags.map(tag => (
                <View key={tag.id} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

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

            <TouchableOpacity
              style={[styles.detailActionButton, styles.detailTagButton]}
              onPress={openEditTags}
            >
              <Ionicons name="pricetags-outline" size={20} color="#fff" />
              <Text style={styles.detailActionButtonText}>Управление тегами</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal
        visible={editTagsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditTagsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите теги</Text>
            <ScrollView style={styles.modalScroll}>
              {allTags.map(tag => (
                <TouchableOpacity
                  key={tag.id}
                  style={styles.tagItem}
                  onPress={() => toggleTag(tag.id)}
                >
                  <Ionicons
                    name={selectedTagIds.has(tag.id) ? "checkbox" : "square-outline"}
                    size={24}
                    color={selectedTagIds.has(tag.id) ? "#007AFF" : "#999"}
                  />
                  <Text style={styles.tagItemText}>{tag.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setEditTagsModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={saveTags}
                disabled={savingTags}
              >
                {savingTags ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Сохранить</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default MenuItemDetailScreen;