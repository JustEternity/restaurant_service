import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  Image as RNImage
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/EditMenuItemStyles';

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { getPhotoUrl } from '../utils/imageUrl';

interface Category {
  id: number;
  name: string;
  parent_category: number | null;
}

interface MenuItemFormData {
  name: string;
  description: string;
  price: string;
  category: number | null;
  is_available: boolean;
  is_selfserve: boolean;
  photo: string;
}

const MenuItemFormScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { itemId } = route.params as { itemId?: number } || {};

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);

  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const [formData, setFormData] = useState<MenuItemFormData>({
    name: '',
    description: '',
    price: '',
    category: null,
    is_available: true,
    is_selfserve: false,
    photo: '',
  });

  const isEditMode = !!itemId;

  useEffect(() => {
    loadCategories();
    if (isEditMode) {
      loadItem();
    }
  }, [itemId]);

  // -----------------------------
  // 1. Построение дерева категорий
  // -----------------------------
  const buildCategoryTree = (categories: Category[]) => {
    const map: Record<number, any> = {};
    const roots: any[] = [];

    categories.forEach(cat => {
      map[cat.id] = { ...cat, children: [] };
    });

    categories.forEach(cat => {
      if (cat.parent_category) {
        map[cat.parent_category].children.push(map[cat.id]);
      } else {
        roots.push(map[cat.id]);
      }
    });

    return roots;
  };

  const loadCategories = async () => {
    try {
      const response = await api.get('/menu/categories/');
      setCategories(response.data);
      setCategoryTree(buildCategoryTree(response.data));
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
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
        is_selfserve: data.is_selfserve ?? false,
        photo: data.photo || '',
      });
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить данные блюда');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Ошибка доступа к галерее', 'Пожалуйста, предоставьте доступ к галерее, чтобы выбрать фото');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled) return;

    const manipResult = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const uri = manipResult.uri;

    if (isEditMode && itemId) {
      await uploadPhotoToServer(itemId, uri);
    } else {
      setSelectedImageUri(uri);
    }
  };

  const uploadPhotoToServer = async (menuId: number, uri: string) => {
    setUploadingPhoto(true);
    try {
      const formDataObj = new FormData();
      formDataObj.append('file', {
        uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as any);

      const resp = await api.post(`/menu/${menuId}/upload-photo`, formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setFormData(prev => ({ ...prev, photo: resp.data.photo_url }));
      setSelectedImageUri(null);
    } catch (error: any) {
      Alert.alert('Ошибка', error.message);
    } finally {
      setUploadingPhoto(false);
    }
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
      is_selfserve: formData.is_selfserve,
      photo: formData.photo.trim() || '',
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await api.put(`/menu/${itemId}`, payload);
      } else {
        const response = await api.post('/menu/', payload);
        const newItemId = response.data.id;
        if (selectedImageUri) {
          await uploadPhotoToServer(newItemId, selectedImageUri);
        }
      }
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

  // -----------------------------
  // 2. Рекурсивный рендер дерева
  // -----------------------------
  const renderCategoryNode = (node: any, level = 0) => {
    return (
      <View key={node.id}>
        <TouchableOpacity
          style={[styles.categoryRow, { paddingLeft: 16 + level * 20 }]}
          onPress={() => {
            setFormData(prev => ({ ...prev, category: node.id }));
            setCategoryModalVisible(false);
          }}
        >
          <View
            style={[
              styles.radioOuter,
              formData.category === node.id && styles.radioOuterSelected
            ]}
          >
            {formData.category === node.id && <View style={styles.radioInner} />}
          </View>

          <Text style={styles.categoryRowText}>{node.name}</Text>
        </TouchableOpacity>

        {node.children?.map(child => renderCategoryNode(child, level + 1))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Редактировать блюдо' : 'Новое блюдо'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Название</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
          placeholder="Введите название"
          placeholderTextColor="#888787"
        />

        <Text style={styles.label}>Описание</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={text => setFormData(prev => ({ ...prev, description: text }))}
          placeholder="Введите описание"
          placeholderTextColor="#888787"
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Цена</Text>
        <TextInput
          style={styles.input}
          value={formData.price}
          onChangeText={text => setFormData(prev => ({ ...prev, price: text }))}
          placeholder="0.00"
          placeholderTextColor="#888787"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Категория</Text>
        <TouchableOpacity style={styles.tagSelector} onPress={() => setCategoryModalVisible(true)}>
          <Text style={styles.tagSelectorText}>
            {formData.category
              ? categories.find(cat => cat.id === formData.category)?.name
              : 'Выберите категорию'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        <Text style={styles.label}>Фото</Text>
        <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage} disabled={uploadingPhoto}>
          <Ionicons name="image-outline" size={24} color="#007AFF" />
          <Text style={styles.imagePickerText}>
            {uploadingPhoto ? 'Загрузка...' : 'Выбрать фото'}
          </Text>
        </TouchableOpacity>

        {(selectedImageUri || formData.photo) && (
          <RNImage
            source={{ uri: (selectedImageUri || getPhotoUrl(formData.photo)) ?? undefined }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        )}

        <View style={styles.switchContainer}>
          <Text style={styles.label}>Доступно</Text>
          <Switch
            value={formData.is_available}
            onValueChange={value => setFormData(prev => ({ ...prev, is_available: value }))}
            trackColor={{ false: '#767577', true: '#007AFF' }}
          />
        </View>

        <View style={styles.switchContainer}>
          <Text style={styles.label}>Подаётся официантом</Text>
          <Switch
            value={formData.is_selfserve}
            onValueChange={value => setFormData(prev => ({ ...prev, is_selfserve: value }))}
            trackColor={{ false: '#767577', true: '#007AFF' }}
          />
        </View>

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

      <Modal
        visible={categoryModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите категорию</Text>

            <ScrollView style={styles.modalScroll}>
              {categoryTree.map(node => renderCategoryNode(node))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseButton, styles.cancelButton]}
              onPress={() => setCategoryModalVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default MenuItemFormScreen;
