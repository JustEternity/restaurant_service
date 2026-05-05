import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Animated,
  TextInput,
} from 'react-native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import styles from '../design/WaiterMenuStyles';

interface Category {
  id: number;
  name: string;
  parent_category: number | null;
  children: Category[];
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

interface ExistingPlate {
  id: number;
  plate_id: number;
  count: number;
  comment: string | null;
  price: number;
  current_status: string;
}

interface CartItem {
  item: MenuItem;
  quantity: number;
  comment: string;
  id?: number;
}

type RootStackParamList = {
  MenuList: undefined;
  MenuItemForm: { itemId?: number };
  WaiterMenu: { selectedTableIds?: number[]; orderId: number; existingPlates: ExistingPlate[] };
};

const WaiterMenu = () => {
  const { authToken, user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const selectedTableIds = (route.params as any)?.selectedTableIds || [];
  const orderId = (route.params as any)?.orderId;
  const existingPlates: ExistingPlate[] = (route.params as any)?.existingPlates || [];

  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [categoryPath, setCategoryPath] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);

  const swipeableRefs = new Map();
  const isAdmin = user?.role === 'admin';
  const isNewOrderMode = selectedTableIds.length > 0;
  const isEditMode = !!orderId;

  const currentCategory = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : null;
  const currentLevelCategories = categoryPath.length === 0
    ? categoriesTree
    : currentCategory?.children || [];

  useEffect(() => {
    if (isEditMode && existingPlates.length > 0) {
      const initialCart: CartItem[] = existingPlates.map(ep => ({
        item: {
          id: ep.plate_id,
          name: '',
          description: '',
          photo: null,
          price: ep.price,
          category: 0,
          is_available: true,
          category_name: null,
        },
        quantity: ep.count,
        comment: ep.comment || '',
        id: ep.id,
      }));
      setCart(initialCart);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (isEditMode && cart.length > 0 && menuItems.length > 0) {
      setCart(prev => prev.map(ci => {
        const menuItem = menuItems.find(m => m.id === ci.item.id);
        if (menuItem) {
          return { ...ci, item: { ...ci.item, name: menuItem.name, description: menuItem.description, photo: menuItem.photo, category_name: menuItem.category_name } };
        }
        return ci;
      }));
    }
  }, [menuItems]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentCategory) {
      setFilteredItems(menuItems.filter(item => item.category === currentCategory.id));
    } else {
      setFilteredItems(menuItems);
    }
  }, [categoryPath, menuItems]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchCategories(), fetchMenuItems()]);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/categories/?flat=false`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: Category[] = await response.json();

      const deduplicateChildren = (cat: Category) => {
        if (cat.children && cat.children.length > 0) {
          const unique = cat.children.filter(
            (child, index, self) => self.findIndex(c => c.id === child.id) === index
          );
          cat.children = unique;
          cat.children.forEach(deduplicateChildren);
        }
      };
      data.forEach(deduplicateChildren);
      setCategoriesTree(data);
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: MenuItem[] = await response.json();
      const available = data.filter(item => item.is_available);
      setMenuItems(available);
    } catch (error) {
      console.error('Ошибка загрузки меню:', error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSelectCategory = (category: Category) => {
    setCategoryPath([...categoryPath, category]);
  };

  const handleBack = () => {
    setCategoryPath(categoryPath.slice(0, -1));
  };

  const handleResetCategories = () => {
    setCategoryPath([]);
  };

  const handleItemPress = (item: MenuItem) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setTimeout(() => setSelectedItem(null), 300);
  };

  const handleEditItem = (item: MenuItem) => {
    if (!isAdmin) return;
    swipeableRefs.get(item.id)?.close();
    navigation.navigate('MenuItemForm', { itemId: item.id });
  };

  const handleDeleteItem = (item: MenuItem) => {
    if (!isAdmin) return;
    swipeableRefs.get(item.id)?.close();
    Alert.alert('Удалить позицию', `Вы уверены, что хотите удалить "${item.name}"?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteMenuItem(item.id) }
    ]);
  };

  const deleteMenuItem = async (id: number) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/menu/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      setMenuItems(prev => prev.filter(item => item.id !== id));
      Alert.alert('Успешно', 'Позиция удалена');
    } catch (error) {
      console.error('Ошибка удаления:', error);
      Alert.alert('Ошибка', 'Не удалось удалить позицию');
    }
  };

  const handleAddItem = () => {
    if (!isAdmin) {
      Alert.alert('Доступ запрещен', 'Только администратор может добавлять позиции');
      return;
    }
    navigation.navigate('MenuItemForm');
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      if (isEditMode) {
        const existingWaitingIndex = prev.findIndex(cartItem => {
          if (cartItem.id !== undefined) {
            const ep = existingPlates.find(p => p.id === cartItem.id);
            return ep && ep.current_status === 'waiting' && cartItem.item.id === item.id;
          }
          return false;
        });
        if (existingWaitingIndex !== -1) {
          return prev.map((ci, idx) =>
            idx === existingWaitingIndex ? { ...ci, quantity: ci.quantity + 1 } : ci
          );
        }
        return [...prev, { item, quantity: 1, comment: '', id: undefined }];
      } else {
        const existing = prev.find(i => i.item.id === item.id);
        if (existing) {
          return prev.map(i =>
            i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prev, { item, quantity: 1, comment: '' }];
      }
    });
  };

  const updateCartItem = (idOrPlateId: number, quantity: number, comment?: string) => {
    setCart(prev => prev.map(i => {
      const compareId = i.id || i.item.id;
      if (compareId === idOrPlateId) {
        return { ...i, quantity: Math.max(1, quantity), comment: comment ?? i.comment };
      }
      return i;
    }));
  };

  const removeCartItem = (idOrPlateId: number) => {
    if (isEditMode) {
      const existing = existingPlates.find(ep => (ep.id === idOrPlateId || ep.plate_id === idOrPlateId));
      if (existing && existing.current_status !== 'waiting') {
        Alert.alert('Нельзя удалить', 'Это блюдо уже готовится или готово');
        return;
      }
    }
    setCart(prev => prev.filter(i => {
      const compareId = i.id || i.item.id;
      return compareId !== idOrPlateId;
    }));
  };

  const getTotalPrice = () => cart.reduce((sum, i) => sum + i.item.price * i.quantity, 0);

  const submitOrder = async () => {
    if (cart.length === 0) {
      Alert.alert('Корзина пуста', 'Добавьте хотя бы одно блюдо');
      return;
    }
    try {
      const payload = {
        waiter: user?.id,
        tables: selectedTableIds,
        plates: cart.map(i => ({
          plate_id: i.item.id,
          count: i.quantity,
          comment: i.comment,
        })),
      };
      const response = await fetch(`${API_CONFIG.BASE_URL}/orders/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Ошибка создания заказа');
      Alert.alert('Успех', 'Заказ создан');
      setCart([]);
      setCartModalVisible(false);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать заказ');
    }
  };

  const saveEditedOrder = async () => {
    if (!orderId) return;
    try {
      const platesToSend = cart.map(i => ({
        id: i.id,
        plate_id: i.item.id,
        count: i.quantity,
        comment: i.comment,
        initial_status: 'waiting',
      }));
      const response = await fetch(`${API_CONFIG.BASE_URL}/orders/${orderId}/plates`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(platesToSend),
      });
      if (!response.ok) throw new Error('Ошибка сохранения изменений');
      Alert.alert('Заказ обновлён', 'Изменения сохранены');
      setCartModalVisible(false);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить заказ');
    }
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[styles.categoryItem, currentCategory?.id === item.id && styles.categoryItemSelected]}
      onPress={() => handleSelectCategory(item)}
    >
      <Text style={[styles.categoryText, currentCategory?.id === item.id && styles.categoryTextSelected]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const content = (
      <View style={styles.menuItemContent}>
        <TouchableOpacity style={{ flex: 1, flexDirection: 'row' }} onPress={() => handleItemPress(item)} activeOpacity={0.7}>
          <View style={styles.menuItemInfo}>
            <Text style={styles.menuItemName}>{item.name}</Text>
            <Text style={styles.menuItemDescription} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.menuItemPrice}>{item.price} ₽</Text>
          </View>
          {item.photo ? (
            <Image source={{ uri: item.photo }} style={styles.menuItemImage} resizeMode="cover" />
          ) : (
            <View style={[styles.menuItemImage, styles.noImage]}>
              <Ionicons name="fast-food-outline" size={30} color="#999" />
            </View>
          )}
        </TouchableOpacity>
        {(isNewOrderMode || isEditMode) && (
          <TouchableOpacity style={localStyles.addToCartButton} onPress={() => addToCart(item)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );

    if (isAdmin && !isNewOrderMode && !isEditMode) {
      return (
        <Swipeable
          ref={(ref) => { if (ref) swipeableRefs.set(item.id, ref); }}
          renderRightActions={(progress, dragX) => {
            const trans = dragX.interpolate({ inputRange: [-100, 0], outputRange: [0, 100] });
            return (
              <View style={styles.swipeActions}>
                <RectButton style={[styles.swipeButton, styles.editButton]} onPress={() => handleEditItem(item)}>
                  <Animated.View style={{ transform: [{ translateX: trans }] }}>
                    <Ionicons name="create-outline" size={22} color="#fff" />
                    <Text style={styles.swipeButtonText}>Изменить</Text>
                  </Animated.View>
                </RectButton>
                <RectButton style={[styles.swipeButton, styles.deleteButton]} onPress={() => handleDeleteItem(item)}>
                  <Animated.View style={{ transform: [{ translateX: trans }] }}>
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                    <Text style={styles.swipeButtonText}>Удалить</Text>
                  </Animated.View>
                </RectButton>
              </View>
            );
          }}
          overshootRight={false}
        >
          <View style={styles.menuItem}>{content}</View>
        </Swipeable>
      );
    }
    return <View style={styles.menuItem}>{content}</View>;
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
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {(isNewOrderMode || isEditMode) && (
            <TouchableOpacity onPress={() => setCartModalVisible(true)}>
              <View>
                <Ionicons name="cart-outline" size={28} color="#007AFF" />
                {cart.length > 0 && (
                  <View style={localStyles.cartBadge}>
                    <Text style={localStyles.cartBadgeText}>{cart.reduce((s, i) => s + i.quantity, 0)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          {isEditMode && (
            <TouchableOpacity onPress={saveEditedOrder} style={localStyles.saveButton}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Сохранить</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerSubtitle}>
          {categoryPath.length > 0
            ? categoryPath.map(c => c.name).join(' / ')
            : 'Все блюда'} • {filteredItems.length} позиций
        </Text>
      </View>

      <View style={styles.categoriesContainer}>
        {categoryPath.length > 0 && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={styles.backButtonText}>Назад</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.categoryItem, categoryPath.length === 0 && styles.categoryItemSelected]}
          onPress={handleResetCategories}
        >
          <Text style={[styles.categoryText, categoryPath.length === 0 && styles.categoryTextSelected]}>Все</Text>
        </TouchableOpacity>
        <FlatList
          key={currentCategory?.id || 'root'}
          data={currentLevelCategories}
          renderItem={renderCategoryItem}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          extraData={categoryPath}
        />
      </View>

      <FlatList
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} />}
        contentContainerStyle={[styles.menuList, { paddingBottom: isAdmin && !isNewOrderMode && !isEditMode ? 100 : 20 }]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>
              {categoryPath.length > 0
                ? `В категории "${categoryPath[categoryPath.length - 1].name}" нет блюд`
                : 'Меню пусто'}
            </Text>
          </View>
        }
      />

      {isAdmin && !isNewOrderMode && !isEditMode && (
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
          <View style={styles.addButtonInner}>
            <Ionicons name="add" size={28} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Модалка деталей блюда */}
      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseModal}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            {selectedItem && (
              <ScrollView>
                {selectedItem.photo ? (
                  <Image source={{ uri: selectedItem.photo }} style={styles.modalImage} />
                ) : (
                  <View style={[styles.modalImage, styles.modalNoImage]}>
                    <Ionicons name="fast-food-outline" size={60} color="#ccc" />
                  </View>
                )}
                <View style={styles.modalInfo}>
                  <Text style={styles.modalName}>{selectedItem.name}</Text>
                  <Text style={styles.modalPrice}>{selectedItem.price} ₽</Text>
                  <Text style={styles.modalCategory}>{selectedItem.category_name}</Text>
                  <Text>{selectedItem.description || 'Описание отсутствует'}</Text>
                </View>
                {isAdmin && !isNewOrderMode && !isEditMode && (
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={[styles.modalActionButton, styles.editButton]} onPress={() => { handleCloseModal(); handleEditItem(selectedItem); }}>
                      <Text>Редактировать</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalActionButton, styles.deleteButton]} onPress={() => { handleCloseModal(); handleDeleteItem(selectedItem); }}>
                      <Text>Удалить</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {(isNewOrderMode || isEditMode) && (
                  <TouchableOpacity style={localStyles.modalAddToCartButton} onPress={() => { addToCart(selectedItem); handleCloseModal(); }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Добавить в корзину</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Модалка корзины */}
      <Modal visible={cartModalVisible} animationType="slide" transparent>
        <View style={localStyles.cartModalOverlay}>
          <View style={localStyles.cartModalContent}>
            <View style={localStyles.modalHeader}>
              <Text style={localStyles.modalTitle}>Корзина</Text>
              <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: '70%' }}>
              {cart.map(cartItem => {
                const existing = (isEditMode && cartItem.id !== undefined)
                  ? existingPlates.find(ep => ep.id === cartItem.id)
                  : null;
                const isLocked = existing && existing.current_status !== 'waiting';
                return (
                  <View key={cartItem.id || cartItem.item.id} style={[localStyles.cartItem, isLocked && { opacity: 0.6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600' }}>{cartItem.item.name}</Text>
                      <Text style={{ color: '#666' }}>{cartItem.item.price} ₽</Text>
                      {!isLocked && (
                        <TextInput
                          style={localStyles.commentInput}
                          placeholder="Комментарий"
                          value={cartItem.comment}
                          onChangeText={(text) => updateCartItem(cartItem.id || cartItem.item.id, cartItem.quantity, text)}
                        />
                      )}
                    </View>
                    <View style={localStyles.quantityControl}>
                      {!isLocked ? (
                        <>
                          <TouchableOpacity onPress={() => updateCartItem(cartItem.id || cartItem.item.id, cartItem.quantity - 1)}>
                            <Ionicons name="remove-circle-outline" size={28} color="#007AFF" />
                          </TouchableOpacity>
                          <Text style={{ marginHorizontal: 8, fontSize: 16 }}>{cartItem.quantity}</Text>
                          <TouchableOpacity onPress={() => updateCartItem(cartItem.id || cartItem.item.id, cartItem.quantity + 1)}>
                            <Ionicons name="add-circle-outline" size={28} color="#007AFF" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeCartItem(cartItem.id || cartItem.item.id)} style={{ marginLeft: 12 }}>
                            <Ionicons name="trash-outline" size={22} color="#e74c3c" />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={{ color: '#999' }}>Нельзя изменить</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={localStyles.cartFooter}>
              <Text style={localStyles.totalText}>Итого: {getTotalPrice()} ₽</Text>
              {isNewOrderMode ? (
                <TouchableOpacity style={localStyles.submitOrderButton} onPress={submitOrder}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Оформить заказ</Text>
                </TouchableOpacity>
              ) : isEditMode ? (
                <TouchableOpacity style={localStyles.submitOrderButton} onPress={saveEditedOrder}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Сохранить</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const localStyles = {
  addToCartButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  cartBadge: {
    position: 'absolute',
    right: -6,
    top: -4,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  modalAddToCartButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  cartModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  cartModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    fontSize: 14,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  cartFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalText: { fontSize: 18, fontWeight: '700' },
  submitOrderButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
};

Object.assign(styles, localStyles);

export default WaiterMenu;