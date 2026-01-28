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
  Animated
} from 'react-native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';

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

const AdminMenu = ({ navigation }: any) => {
  const { authToken, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Для управления свайпом
  const swipeableRefs = new Map();

  // Загружаем данные при монтировании
  useEffect(() => {
    loadData();
  }, []);

  // Фильтруем меню при изменении выбранной категории
  useEffect(() => {
    if (selectedCategory) {
      const filtered = menuItems.filter(item => item.category === selectedCategory.id);
      setFilteredItems(filtered);
    } else {
      setFilteredItems(menuItems);
    }
  }, [selectedCategory, menuItems]);

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

      // Выбираем первую категорию по умолчанию
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
      // Фильтруем только доступные блюда
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

  // Функция для добавления новой позиции
  const handleAddItem = () => {
    // Здесь будет переход на экран добавления позиции
    Alert.alert(
      'Добавить позицию',
      'Функция добавления позиции будет реализована в следующем этапе',
      [{ text: 'OK' }]
    );
  };

  // Функция для редактирования позиции
  const handleEditItem = (item: MenuItem) => {
    // Закрываем свайп
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

  // Функция для удаления позиции
  const handleDeleteItem = (item: MenuItem) => {
    // Закрываем свайп
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

  // API вызов для удаления позиции
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

      // Удаляем из state
      setMenuItems(prev => prev.filter(item => item.id !== id));
      Alert.alert('Успешно', 'Позиция удалена');
    } catch (error) {
      console.error('Ошибка удаления:', error);
      Alert.alert('Ошибка', 'Не удалось удалить позицию');
    }
  };

  // Компонент правых кнопок для свайпа
  const renderRightActions = (progress: any, dragX: any, item: MenuItem) => {
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

  const renderMenuItem = ({ item }: { item: MenuItem }) => (
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
        <View style={styles.menuItemContent}>
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
        </View>
      </View>
    </Swipeable>
  );

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
        <Text style={styles.headerTitle}>Меню ресторана</Text>
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
        contentContainerStyle={styles.menuList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>
              {selectedCategory
                ? `В категории "${selectedCategory.name}" пока нет блюд`
                : 'Меню пусто'
              }
            </Text>
          </View>
        }
      />

      {/* Кнопка добавления (только для админов/менеджеров) */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  categoriesContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  categoriesList: {
    marginLeft: 10,
  },
  categoryItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f3f4',
    marginRight: 8,
    height: 36,
    justifyContent: 'center',
  },
  categoryItemSelected: {
    backgroundColor: '#007AFF',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  categoryTextSelected: {
    color: '#fff',
  },
  menuList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 100, // Отступ для кнопки добавления
  },
  menuItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  menuItemContent: {
    flexDirection: 'row',
    padding: 16,
  },
  menuItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  menuItemName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  menuItemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
    lineHeight: 18,
  },
  menuItemPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  menuItemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  noImage: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 40,
  },
  // Стили для свайпа
  swipeActions: {
    flexDirection: 'row',
    width: 160,
  },
  swipeButton: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeButtonText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#FF9500',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  // Стили для кнопки добавления
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    zIndex: 100,
  },
  addButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});

export default AdminMenu;