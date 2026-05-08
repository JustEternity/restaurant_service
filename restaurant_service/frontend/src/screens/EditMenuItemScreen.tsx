import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/EditMenuItemStyles';

interface Category {
  id: number;
  name: string;
}

interface Tag {
  id: number;
  name: string;
}

interface MenuItemFormData {
  name: string;
  description: string;
  price: string;
  category: number | null;
  is_available: boolean;
  photo: string;
  tag_ids: number[];
}

const MenuItemFormScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { itemId } = route.params as { itemId?: number } || {};

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagSelectionModal, setTagSelectionModal] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

  const [formData, setFormData] = useState<MenuItemFormData>({
    name: '',
    description: '',
    price: '',
    category: null,
    is_available: true,
    photo: '',
    tag_ids: [],
  });

  const isEditMode = !!itemId;

  useEffect(() => {
    loadCategories();
    loadTags();
    if (isEditMode) {
      loadItem();
    }
  }, [itemId]);

  const loadCategories = async () => {
    try {
      const response = await api.get('/menu/categories/');
      setCategories(response.data);
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
    }
  };

  const loadTags = async () => {
    try {
      const response = await api.get('/tags/');
      setAllTags(response.data);
    } catch (error) {
      console.error('Ошибка загрузки тегов:', error);
    }
  };

  const loadItem = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/menu/${itemId}`);
      const data = response.data;
      setFormData({
        name: data.name || '',
        description: data.description || '',
        price: data.price ? data.price.toString() : '',
        category: data.category || null,
        is_available: data.is_available,
        photo: data.photo || '',
        tag_ids: data.tags?.map((t: Tag) => t.id) || [],
      });
      setSelectedTagIds(new Set(data.tags?.map((t: Tag) => t.id) || []));
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить данные блюда');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tagId: number) => {
    const newSet = new Set(selectedTagIds);
    if (newSet.has(tagId)) {
      newSet.delete(tagId);
    } else {
      newSet.add(tagId);
    }
    setSelectedTagIds(newSet);
    setFormData(prev => ({ ...prev, tag_ids: Array.from(newSet) }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Ошибка', 'Введите название блюда');
      return;
    }
    if (!formData.price || isNaN(parseFloat(formData.price))) {
      Alert.alert('Ошибка', 'Введите корректную цену');
      return;
    }
    if (!formData.category) {
      Alert.alert('Ошибка', 'Выберите категорию');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      price: parseFloat(formData.price),
      category: formData.category,
      is_available: formData.is_available,
      photo: formData.photo.trim() || '',
      tag_ids: formData.tag_ids,
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await api.put(`/menu/${itemId}`, payload);
      } else {
        await api.post('/menu/', payload);
      }

      Alert.alert('Успешно', isEditMode ? 'Блюдо обновлено' : 'Блюдо создано');
      navigation.goBack();
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || error.message || 'Ошибка сохранения';
      Alert.alert('Ошибка', errMsg);
    } finally {
      setSaving(false);
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Редактировать' : 'Новое блюдо'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Название *</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
          placeholder="Введите название"
        />

        <Text style={styles.label}>Описание</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={text => setFormData(prev => ({ ...prev, description: text }))}
          placeholder="Введите описание"
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Цена *</Text>
        <TextInput
          style={styles.input}
          value={formData.price}
          onChangeText={text => setFormData(prev => ({ ...prev, price: text }))}
          placeholder="0.00"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Категория *</Text>
        <View style={styles.pickerContainer}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryOption,
                formData.category === cat.id && styles.categoryOptionSelected,
              ]}
              onPress={() => setFormData(prev => ({ ...prev, category: cat.id }))}
            >
              <Text
                style={[
                  styles.categoryOptionText,
                  formData.category === cat.id && styles.categoryOptionTextSelected,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Фото (URL)</Text>
        <TextInput
          style={styles.input}
          value={formData.photo}
          onChangeText={text => setFormData(prev => ({ ...prev, photo: text }))}
          placeholder="https://example.com/image.jpg"
        />

        <View style={styles.switchContainer}>
          <Text style={styles.label}>Доступно</Text>
          <Switch
            value={formData.is_available}
            onValueChange={value => setFormData(prev => ({ ...prev, is_available: value }))}
            trackColor={{ false: '#767577', true: '#007AFF' }}
          />
        </View>

        <Text style={styles.label}>Теги</Text>
        <TouchableOpacity style={styles.tagSelector} onPress={() => setTagSelectionModal(true)}>
          <Text style={styles.tagSelectorText}>
            {formData.tag_ids.length > 0
              ? `Выбрано тегов: ${formData.tag_ids.length}`
              : 'Выбрать теги'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        {formData.tag_ids.length > 0 && (
          <View style={styles.selectedTags}>
            {allTags
              .filter(tag => formData.tag_ids.includes(tag.id))
              .map(tag => (
                <View key={tag.id} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{tag.name}</Text>
                </View>
              ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Сохранить</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Модальное окно выбора тегов */}
      <Modal visible={tagSelectionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите теги</Text>
            <FlatList
              data={allTags}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalTagItem} onPress={() => toggleTag(item.id)}>
                  <Ionicons
                    name={selectedTagIds.has(item.id) ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={selectedTagIds.has(item.id) ? '#007AFF' : '#999'}
                  />
                  <Text style={styles.modalTagText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setTagSelectionModal(false)}>
              <Text style={styles.modalCloseButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default MenuItemFormScreen;