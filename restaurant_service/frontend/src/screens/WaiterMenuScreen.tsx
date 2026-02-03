import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Alert,
  Animated,
  Modal,
  ScrollView
} from 'react-native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import styles from '../design/WaiterMenuStyles';

type RootStackParamList = {
  MenuList: undefined;
  MenuItemDetail: { itemId: number };
};

interface Category {
  id: number;
  name: string;
}

interface MenuItem {
  id: number;
  name: string;
  description: string;
  photo: string | null;
  price: number;
  category: number;
  is_available: boolean;
  category_name: string | null;
}

const WaiterMenu = () => {
  const { authToken, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  // Сохраняем навигацию, если она используется в других местах
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // Для управления свайпом
  const swipeableRefs = new Map();

  // Проверка на админа для редактирования меню
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      const filtered = menuItems.filter(item => item.category === selectedCategory.id);
      setFilteredItems(filtered);
    } else {
      setFilteredItems(menuItems);
    }
  }, [selectedCategory, menuItems]);

  const handleItemPress = (item: MenuItem): void => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      await Promise.all([
        fetchCategories(),
        fetchMenuItems()
      ]);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCategories = async (): Promise<Category[]> => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/categories/`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: Category[] = await response.json();
      setCategories(data);

      if (data.length > 0 && !selectedCategory) {
        setSelectedCategory(data[0]);
      }

      return data;
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
      return [];
    }
  };

  const fetchMenuItems = async (): Promise<MenuItem[]> => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: MenuItem[] = await response.json();
      const availableItems = data.filter(item => item.is_available);
      setMenuItems(availableItems);
      return availableItems;
    } catch (error) {
      console.error('Ошибка загрузки меню:', error);
      return [];
    }
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    loadData();
  };

  const handleCategorySelect = (category: Category): void => {
    setSelectedCategory(category);
  };

  const handleAddItem = () => {
    if (!isAdmin) {
      Alert.alert('Доступ запрещен', 'Только администратор может добавлять позиции');
      return;
    }

    Alert.alert(
      'Добавить позицию',
      'Функция добавления позиции будет реализована в следующем этапе',
      [{ text: 'OK' }]
    );
  };

  const handleEditItem = (item: MenuItem) => {
    if (!isAdmin) return;

    const swipeable = swipeableRefs.get(item.id);
    if (swipeable) {
      swipeable.close();
    }

    Alert.alert(
      'Редактировать',
      `Редактирование "${item.name}" будет реализовано в следующем этапе`,
      [{ text: 'OK' }]
    );
  };

  const handleDeleteItem = (item: MenuItem) => {
    if (!isAdmin) return;

    const swipeable = swipeableRefs.get(item.id);
    if (swipeable) {
      swipeable.close();
    }

    Alert.alert(
      'Удалить позицию',
      `Вы уверены, что хотите удалить "${item.name}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => deleteMenuItem(item.id)
        }
      ]
    );
  };

  const deleteMenuItem = async (id: number) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setMenuItems(prev => prev.filter(item => item.id !== id));
      Alert.alert('Успешно', 'Позиция удалена');
    } catch (error) {
      console.error('Ошибка удаления:', error);
      Alert.alert('Ошибка', 'Не удалось удалить позицию');
    }
  };

  const handleCloseModal = (): void => {
    setModalVisible(false);
    setTimeout(() => setSelectedItem(null), 300);
  };

  const renderRightActions = (progress: any, dragX: any, item: MenuItem) => {
    if (!isAdmin) return null;

    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.swipeActions}>
        {/* Кнопка редактирования */}
        <RectButton
          style={[styles.swipeButton, styles.editButton]}
          onPress={() => handleEditItem(item)}
        >
          <Animated.View
            style={[
              styles.swipeButtonContent,
              {
                transform: [{ translateX: trans }],
              },
            ]}
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
            <Text style={styles.swipeButtonText}>Изменить</Text>
          </Animated.View>
        </RectButton>

        {/* Кнопка удаления */}
        <RectButton
          style={[styles.swipeButton, styles.deleteButton]}
          onPress={() => handleDeleteItem(item)}
        >
          <Animated.View
            style={[
              styles.swipeButtonContent,
              {
                transform: [{ translateX: trans }],
              },
            ]}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
            <Text style={styles.swipeButtonText}>Удалить</Text>
          </Animated.View>
        </RectButton>
      </View>
    );
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[
        styles.categoryItem,
        selectedCategory?.id === item.id && styles.categoryItemSelected
      ]}
      onPress={() => handleCategorySelect(item)}
    >
      <Text
        style={[
          styles.categoryText,
          selectedCategory?.id === item.id && styles.categoryTextSelected
        ]}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const menuItemContent = (
      <TouchableOpacity
        style={styles.menuItemContent}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.menuItemInfo}>
          <Text style={styles.menuItemName}>{item.name}</Text>
          <Text style={styles.menuItemDescription} numberOfLines={2}>
            {item.description}
          </Text>
          <Text style={styles.menuItemPrice}>
            {item.price} ₽
          </Text>
        </View>
        {item.photo ? (
          <Image
            source={{ uri: item.photo }}
            style={styles.menuItemImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.menuItemImage, styles.noImage]}>
            <Ionicons name="fast-food-outline" size={30} color="#999" />
          </View>
        )}
      </TouchableOpacity>
    );

    if (isAdmin) {
      return (
        <Swipeable
          ref={(ref) => {
            if (ref) {
              swipeableRefs.set(item.id, ref);
            }
          }}
          renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
          overshootRight={false}
          friction={2}
          rightThreshold={40}
        >
          <View style={styles.menuItem}>
            {menuItemContent}
          </View>
        </Swipeable>
      );
    } else {
      return (
        <View style={styles.menuItem}>
          {menuItemContent}
        </View>
      );
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка меню...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>
          {selectedCategory ? selectedCategory.name : 'Все блюда'} • {filteredItems.length} позиций
        </Text>
      </View>

      {/* Слайдер категорий */}
      <View style={styles.categoriesContainer}>
        <TouchableOpacity
          style={[
            styles.categoryItem,
            !selectedCategory && styles.categoryItemSelected
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text
            style={[
              styles.categoryText,
              !selectedCategory && styles.categoryTextSelected
            ]}
          >
            Все
          </Text>
        </TouchableOpacity>
        <FlatList
          data={categories}
          renderItem={renderCategoryItem}
          keyExtractor={(item: Category) => item.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesList}
        />
      </View>

      {/* Список блюд */}
      <FlatList
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item: MenuItem) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
          />
        }
        contentContainerStyle={[
          styles.menuList,
          { paddingBottom: isAdmin ? 100 : 20 }
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>
              {selectedCategory
                ? `В категории "${selectedCategory.name}" нет блюд`
                : 'Меню пусто'
              }
            </Text>
          </View>
        }
      />

      {/* Кнопка добавления (только для админа) */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddItem}
          activeOpacity={0.8}
        >
          <View style={styles.addButtonInner}>
            <Ionicons name="add" size={28} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Модальное окно с деталями блюда */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Кнопка закрытия */}
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseModal}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            {/* Контент модального окна */}
            {selectedItem && (
              <ScrollView style={styles.modalScrollView}>
                {/* Изображение */}
                {selectedItem.photo ? (
                  <Image
                    source={{ uri: selectedItem.photo }}
                    style={styles.modalImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.modalImage, styles.modalNoImage]}>
                    <Ionicons name="fast-food-outline" size={60} color="#ccc" />
                  </View>
                )}

                {/* Информация о блюде */}
                <View style={styles.modalInfo}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalName}>{selectedItem.name}</Text>
                    <Text style={styles.modalPrice}>{selectedItem.price} ₽</Text>
                  </View>

                  <View style={styles.modalCategory}>
                    <Ionicons name="list-outline" size={16} color="#666" />
                    <Text style={styles.modalCategoryText}>{selectedItem.category_name}</Text>
                  </View>

                  <View style={[
                    styles.modalAvailability,
                    selectedItem.is_available ? styles.available : styles.unavailable
                  ]}>
                    <Ionicons
                      name={selectedItem.is_available ? "checkmark-circle" : "close-circle"}
                      size={16}
                      color={selectedItem.is_available ? "#2ecc71" : "#e74c3c"}
                    />
                    <Text style={[
                      styles.modalAvailabilityText,
                      { color: selectedItem.is_available ? "#2ecc71" : "#e74c3c" }
                    ]}>
                      {selectedItem.is_available ? "Доступно" : "Не доступно"}
                    </Text>
                  </View>

                  <Text style={styles.modalDescription}>
                    {selectedItem.description || 'Описание отсутствует'}
                  </Text>
                </View>

                {/* Кнопки действий для админа */}
                {isAdmin && (
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.editButton]}
                      onPress={() => {
                        handleCloseModal();
                        handleEditItem(selectedItem);
                      }}
                    >
                      <Ionicons name="create-outline" size={20} color="#fff" />
                      <Text style={styles.modalActionButtonText}>Редактировать</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.deleteButton]}
                      onPress={() => {
                        handleCloseModal();
                        handleDeleteItem(selectedItem);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#fff" />
                      <Text style={styles.modalActionButtonText}>Удалить</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};


export default WaiterMenu;