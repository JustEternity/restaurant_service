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
  StyleSheet
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
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

const localStyles = StyleSheet.create({
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tagChip: {
    backgroundColor: '#e1f5fe',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#0288d1',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 400,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tagItemText: {
    fontSize: 16,
    marginLeft: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f1f3f4',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: 30,
    marginBottom: 30,
    width: '100%',
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  editButton: {
    backgroundColor: '#FF9500',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  tagButton: {
    backgroundColor: '#5856D6',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 10,
  },
});

const MenuItemDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { authToken, user } = useAuth();
  const { itemId } = route.params as { itemId: number };

  const [item, setItem] = useState<MenuItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [editTagsModalVisible, setEditTagsModalVisible] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  const isAdmin = user?.role === 'admin';
  console.log('MenuItemDetailScreen: isAdmin =', isAdmin, 'role =', user?.role);

  useEffect(() => {
    loadItem();
    loadAllTags();
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

  const loadAllTags = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/tags/`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAllTags(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки тегов:', error);
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
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/${item.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tag_ids: tagIds }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Ошибка сохранения тегов');
      }
      const updatedItem = await response.json();
      setItem(updatedItem);
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

        {/* Теги */}
        {item.tags && item.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Теги</Text>
            <View style={localStyles.tagsContainer}>
              {item.tags.map(tag => (
                <View key={tag.id} style={localStyles.tagChip}>
                  <Text style={localStyles.tagText}>{tag.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Кнопки действий для админа */}
        {isAdmin && (
          <View style={localStyles.actionsContainer}>
            <TouchableOpacity
              style={[localStyles.actionButton, localStyles.editButton]}
              onPress={handleEdit}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={localStyles.actionButtonText}>Редактировать</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[localStyles.actionButton, localStyles.deleteButton]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={localStyles.actionButtonText}>Удалить</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[localStyles.actionButton, localStyles.tagButton]}
              onPress={openEditTags}
            >
              <Ionicons name="pricetags-outline" size={20} color="#fff" />
              <Text style={localStyles.actionButtonText}>Управление тегами</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Модальное окно выбора тегов */}
      <Modal
        visible={editTagsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditTagsModalVisible(false)}
      >
        <View style={localStyles.modalOverlay}>
          <View style={localStyles.modalContent}>
            <Text style={localStyles.modalTitle}>Выберите теги</Text>
            <ScrollView style={localStyles.modalScroll}>
              {allTags.map(tag => (
                <TouchableOpacity
                  key={tag.id}
                  style={localStyles.tagItem}
                  onPress={() => toggleTag(tag.id)}
                >
                  <Ionicons
                    name={selectedTagIds.has(tag.id) ? "checkbox" : "square-outline"}
                    size={24}
                    color={selectedTagIds.has(tag.id) ? "#007AFF" : "#999"}
                  />
                  <Text style={localStyles.tagItemText}>{tag.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={localStyles.modalButtons}>
              <TouchableOpacity
                style={[localStyles.modalButton, localStyles.cancelButton]}
                onPress={() => setEditTagsModalVisible(false)}
              >
                <Text style={localStyles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[localStyles.modalButton, localStyles.saveButton]}
                onPress={saveTags}
                disabled={savingTags}
              >
                {savingTags ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={localStyles.saveButtonText}>Сохранить</Text>
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