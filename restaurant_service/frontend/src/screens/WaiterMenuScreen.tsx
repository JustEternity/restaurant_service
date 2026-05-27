import React, { useState, useEffect, useRef } from 'react';
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
  TextInput,
  Keyboard,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import styles from '../design/WaiterMenuStyles';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useOrderDraft } from '../context/OrderDraftContext';
import { getPhotoUrl } from '../utils/imageUrl';

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
  is_selfserve: boolean;
}

interface ExistingPlate {
  id: number;
  plate_id: number;
  count: number;
  comment: string | null;
  price: number;
  current_status: string;
  course_number?: number;
}

interface CartItem {
  item: MenuItem;
  quantity: number;
  comment: string;
  id?: number;
  course_number: number;
}

type RootStackParamList = {
  HallMap: { clearDraft?: boolean };
  MenuItemForm: { itemId?: number };
  WaiterMenu: { selectedTableIds?: number[]; orderId?: number; existingPlates?: ExistingPlate[] };
};

const WaiterMenu = () => {
  const { user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { draft, updateCart, clearDraft } = useOrderDraft();

  const orderId = (route.params as any)?.orderId;
  const existingPlates: ExistingPlate[] = (route.params as any)?.existingPlates || [];

  const isEditMode = !!orderId;
  const isNewOrderMode = !isEditMode && draft.isActive;

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
  const [submitting, setSubmitting] = useState(false);
  const [selectedImageAspectRatio, setSelectedImageAspectRatio] = useState<number | null>(null);

  const [categoryTreeModalVisible, setCategoryTreeModalVisible] = useState(false);
  const [categoryEditModalVisible, setCategoryEditModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [availableParentCategories, setAvailableParentCategories] = useState<Category[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [flatCategories, setFlatCategories] = useState<Array<Category & { depth: number }>>([]);

  const swipeableRefs = new Map();
  const isAdmin = user?.role === 'admin';

  const currentCategory = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : null;
  const currentLevelCategories = categoryPath.length === 0
    ? categoriesTree
    : currentCategory?.children || [];

  useEffect(() => {
    if (isNewOrderMode) {
      if (draft.cart.length > 0) {
        setCart(draft.cart);
      } else {
        setCart([]);
      }
    }
  }, [isNewOrderMode]);

  useEffect(() => {
    if (isNewOrderMode) {
      updateCart(cart);
    }
  }, [cart, isNewOrderMode]);

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
          is_selfserve: false,
        },
        quantity: ep.count,
        comment: ep.comment || '',
        id: ep.id,
        course_number: ep.course_number || 1,
      }));
      setCart(initialCart);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (isEditMode && cart.length > 0 && menuItems.length > 0) {
      setCart(prev => prev.map(ci => {
        const menuItem = menuItems.find(m => m.id === ci.item.id);
        if (menuItem) {
          return {
            ...ci,
            item: {
              ...ci.item,
              name: menuItem.name,
              description: menuItem.description,
              photo: menuItem.photo,
              category_name: menuItem.category_name,
              is_selfserve: menuItem.is_selfserve,
            },
          };
        }
        return ci;
      }));
    }
  }, [menuItems]);

  useEffect(() => {
    const uri = selectedItem?.photo ? getPhotoUrl(selectedItem.photo) : null;
    if (!uri) {
      setSelectedImageAspectRatio(null);
      return;
    }

    Image.getSize(
      uri,
      (width, height) => {
        if (width && height) {
          setSelectedImageAspectRatio(width / height);
        }
      },
      () => {
        setSelectedImageAspectRatio(null);
      }
    );
  }, [selectedItem?.photo]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    loadData();
  }, []);

  useEffect(() => {
    const built = buildFlatCategories(categoriesTree);
    setFlatCategories(built);
  }, [categoriesTree]);

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
      const response = await api.get('/menu/categories/tree');
      const data: Category[] = response.data;
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
      const response = await api.get('/menu/');
      const data: MenuItem[] = response.data;
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
      await api.delete(`/menu/${id}`);
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
    navigation.navigate('MenuItemForm', { itemId: undefined });
  };

  const buildFlatCategories = (tree: Category[], depth = 0): Array<Category & { depth: number }> => {
    return tree.reduce<Array<Category & { depth: number }>>((result, category) => {
      result.push({ ...category, depth });
      if (category.children && category.children.length > 0) {
        result.push(...buildFlatCategories(category.children, depth + 1));
      }
      return result;
    }, []);
  };

  const getParentIdByDepth = (flat: Array<Category & { depth: number }>, index: number) => {
    const item = flat[index];
    if (!item || item.depth === 0) return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (flat[i].depth === item.depth - 1) {
        return flat[i].id;
      }
    }
    return null;
  };

  const rebuildTreeFromFlat = (flat: Array<Category & { depth: number }>) => {
    const nodes = new Map<number, Category>();
    flat.forEach(item => {
      nodes.set(item.id, { ...item, children: [] });
    });

    const roots: Category[] = [];
    flat.forEach((item, index) => {
      const node = nodes.get(item.id)!;
      const parentId = getParentIdByDepth(flat, index);
      node.parent_category = parentId;
      if (parentId === null) {
        roots.push(node);
      } else {
        const parent = nodes.get(parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });
    return roots;
  };

  const getAvailableParents = (excludeId: number | null, tree: Category[]): Category[] => {
    const result: Category[] = [];
    const walk = (node: Category) => {
      if (excludeId !== null && node.id === excludeId) {
        return;
      }
      result.push(node);
      if (node.children) {
        node.children.forEach(walk);
      }
    };
    tree.forEach(walk);
    return result;
  };

  const handleCategoryLongPress = (category: Category) => {
    if (!isAdmin) return;
    setCategoryTreeModalVisible(true);
  };

  const handleTreeItemPress = (category: Category & { depth: number }) => {
    if (!isAdmin) return;
    setSelectedCategory(category);
    setIsCreatingCategory(false);
    setEditingCategoryName(category.name);
    setSelectedParentId(category.parent_category);
    const parents = getAvailableParents(category.id, categoriesTree);
    setAvailableParentCategories(parents);
    setShowParentSelector(false);
    setCategoryTreeModalVisible(false);
    setCategoryEditModalVisible(true);
  };


  const handleAddCategoryInTree = () => {
    if (!isAdmin) return;
    setSelectedCategory(null);
    setIsCreatingCategory(true);
    setEditingCategoryName('');
    setSelectedParentId(null);
    setAvailableParentCategories(getAvailableParents(null, categoriesTree));
    setShowParentSelector(false);
    setCategoryTreeModalVisible(false);
    setCategoryEditModalVisible(true);
  };

  const handleAddSubcategory = () => {
    if (!isAdmin || !selectedCategory) return;
    setSelectedCategory(null);
    setIsCreatingCategory(true);
    setEditingCategoryName('');
    setSelectedParentId(selectedCategory.id);
    setAvailableParentCategories(getAvailableParents(null, categoriesTree));
    setShowParentSelector(false);
    setCategoryEditModalVisible(true);
  };

  const createCategory = async (name: string, parentId?: number) => {
    try {
      const payload = {
        name,
        parent_category: parentId || null,
      };
      await api.post('/menu/categories/', payload);
      await fetchCategories();
      setCategoryEditModalVisible(false);
      setSelectedCategory(null);
      setIsCreatingCategory(false);
      setCategoryTreeModalVisible(true);
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось добавить категорию');
    }
  };

  const updateCategory = async () => {
    if (!selectedCategory || !editingCategoryName.trim()) return;
    if (editingCategoryName === selectedCategory.name && selectedParentId === selectedCategory.parent_category) {
      setCategoryEditModalVisible(false);
      setSelectedCategory(null);
      return;
    }
    try {
      await api.put(`/menu/categories/${selectedCategory.id}`, {
        name: editingCategoryName.trim(),
        parent_category: selectedParentId,
      });
      await fetchCategories();
      setCategoryEditModalVisible(false);
      setSelectedCategory(null);
      setIsCreatingCategory(false);
      setCategoryTreeModalVisible(true);
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось обновить категорию');
    }
  };

  const deleteCategory = async () => {
    if (!selectedCategory) return;
    Alert.alert(
      'Удалить категорию',
      `Вы уверены, что хотите удалить категорию "${selectedCategory.name}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/menu/categories/${selectedCategory.id}`);
              await fetchCategories();
              setCategoryEditModalVisible(false);
              setSelectedCategory(null);
              setCategoryTreeModalVisible(true);
            } catch (error: any) {
              Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось удалить категорию');
            }
          },
        },
      ]
    );
  };


  const closeCategoryEditModal = () => {
    Keyboard.dismiss();
    setCategoryEditModalVisible(false);
    setSelectedCategory(null);
    setEditingCategoryName('');
    setShowParentSelector(false);
    setIsCreatingCategory(false);
    setCategoryTreeModalVisible(true);
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
        return [...prev, { item, quantity: 1, comment: '', id: undefined, course_number: 1 }];
      } else {
        const existing = prev.find(i => i.item.id === item.id);
        if (existing) {
          return prev.map(i =>
            i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prev, { item, quantity: 1, comment: '', course_number: 1 }];
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

  const updateCourseNumber = (idOrPlateId: number, newCourse: number) => {
    const clamped = Math.min(10, Math.max(1, newCourse));
    setCart(prev => prev.map(i => {
      const compareId = i.id || i.item.id;
      if (compareId === idOrPlateId) {
        return { ...i, course_number: clamped };
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

  const validateCourses = (items: CartItem[]): string | null => {
    const filtered = items.filter(i => !i.item.is_selfserve);
    if (filtered.length === 0) return null;
    const courseNumbers = Array.from(new Set(filtered.map(i => i.course_number))).sort((a, b) => a - b);
    if (courseNumbers[0] !== 1) {
      return 'Курсы должны начинаться с 1';
    }
    const maxCourse = courseNumbers[courseNumbers.length - 1];
    if (courseNumbers.length !== maxCourse) {
      const missing: number[] = [];
      for (let c = 1; c <= maxCourse; c++) {
        if (!courseNumbers.includes(c)) missing.push(c);
      }
      return `Пропущены курсы: ${missing.join(', ')}`;
    }
    return null;
  };

  const handleCancelOrder = () => {
    clearDraft();
    setCart([]);
    setCartModalVisible(false);
    navigation.navigate('HallMap', { clearDraft: true });
  };

  const submitOrder = async () => {
    if (cart.length === 0) {
      Alert.alert('Корзина пуста', 'Добавьте хотя бы одно блюдо');
      return;
    }
    if (draft.tableIds.length === 0) {
      Alert.alert('Нет столов', 'Вернитесь к схеме зала и выберите столы');
      return;
    }
    const validationError = validateCourses(cart);
    if (validationError) {
      Alert.alert('Ошибка курсов', validationError);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        waiter: user?.id,
        tables: draft.tableIds,
        plates: cart.map(i => ({
          plate_id: i.item.id,
          count: i.quantity,
          comment: i.comment,
          course_number: i.course_number,
        })),
      };
      await api.post('/orders/', payload);
      Alert.alert('Успех', 'Заказ создан');
      clearDraft();
      setCart([]);
      setCartModalVisible(false);
      navigation.navigate('HallMap', { clearDraft: true });
    } catch (error: any) {
      if (error.response?.status === 409) {
        Alert.alert('Стол занят', 'Кто-то уже создал заказ для этого стола. Обновите список заказов.');
        navigation.navigate('HallMap', { clearDraft: true });
      } else {
        Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось создать заказ');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const saveEditedOrder = async () => {
    if (!orderId) return;
    const validationError = validateCourses(cart);
    if (validationError) {
      Alert.alert('Ошибка курсов', validationError);
      return;
    }
    setSubmitting(true);
    try {
      const platesToSend = cart.map(i => ({
        id: i.id,
        plate_id: i.item.id,
        count: i.quantity,
        comment: i.comment,
        initial_status: 'waiting',
        course_number: i.course_number,
      }));
      await api.put(`/orders/${orderId}/plates`, platesToSend);
      Alert.alert('Заказ обновлён', 'Изменения сохранены');
      setCart([]);
      setCartModalVisible(false);
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось обновить заказ');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[styles.categoryItem, currentCategory?.id === item.id && styles.categoryItemSelected]}
      onPress={() => handleSelectCategory(item)}
      onLongPress={() => isAdmin && handleCategoryLongPress(item)}
      delayLongPress={400}
    >
      <Text style={[styles.categoryText, currentCategory?.id === item.id && styles.categoryTextSelected]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderTreeItem = ({ item }: { item: Category & { depth: number }; index: number }) => {
    return (
      <View style={[styles.treeItem, { paddingLeft: 16 + item.depth * 16 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.treeItemRow}
          onPress={() => handleTreeItemPress(item)}
        >
          <View style={{ marginRight: 10, padding: 8 }}>
            <Ionicons name="create-outline" size={20} color="#999" />
          </View>
          <Text style={styles.treeItemText}>{item.name}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const content = (
      <View style={styles.menuItemContent}>
        <TouchableOpacity style={{ flex: 1, flexDirection: 'row' }} onPress={() => handleItemPress(item)} activeOpacity={0.7}>
          <View style={styles.menuItemInfo}>
            <Text style={styles.menuItemName}>
              {item.name}
              {item.is_selfserve ? ' 🧑‍🍳' : ''}
            </Text>
            <Text style={styles.menuItemDescription} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.menuItemPrice}>{item.price} ₽</Text>
          </View>
          {item.photo ? (
            <Image source={{ uri: getPhotoUrl(item.photo) ?? undefined }} style={styles.menuItemImage} resizeMode="contain" />
          ) : (
            <View style={[styles.menuItemImage, styles.noImage]}>
              <Ionicons name="fast-food-outline" size={30} color="#999" />
            </View>
          )}
        </TouchableOpacity>
        {(isNewOrderMode || isEditMode) && (
          <TouchableOpacity style={styles.addToCartButton} onPress={() => addToCart(item)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );

    if (isAdmin && !isNewOrderMode && !isEditMode) {
      return (
        <Swipeable
          ref={(ref) => { if (ref) swipeableRefs.set(item.id, ref); }}
          renderRightActions={() => {
            return (
              <View style={styles.swipeActions}>
                <RectButton style={[styles.swipeCircleButton, styles.editButton]} onPress={() => handleEditItem(item)}>
                  <View style={styles.swipeButtonContent}>
                    <Ionicons name="create-outline" size={22} color="#fff" />
                  </View>
                </RectButton>
                <RectButton style={[styles.swipeCircleButton, styles.deleteButton]} onPress={() => handleDeleteItem(item)}>
                  <View style={styles.swipeButtonContent}>
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                  </View>
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
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cart.reduce((s, i) => s + i.quantity, 0)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          {isNewOrderMode && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
              <Ionicons name="grid-outline" size={20} color="#007AFF" style={{ marginRight: 4 }} />
              <Text style={{ color: '#007AFF', fontWeight: '500' }}>
                Столов: {draft.tableIds.length}
              </Text>
            </View>
          )}
          {isEditMode && (
            <TouchableOpacity onPress={saveEditedOrder} style={styles.saveButton}>
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
          <TouchableOpacity
            style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}
            onPress={handleBack}
          >
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={{ color: '#007AFF', fontSize: 14, fontWeight: '500', marginLeft: 4 }}>Назад</Text>
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

      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseModal}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            {selectedItem && (
              <ScrollView>
                {selectedItem.photo ? (
                  <Image
                    source={{ uri: getPhotoUrl(selectedItem.photo) ?? undefined }}
                    style={[
                      styles.modalImage,
                      selectedImageAspectRatio ? { aspectRatio: selectedImageAspectRatio } : styles.modalImageFallback,
                    ]}
                    resizeMode="contain"
                  />
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
                  {selectedItem.is_selfserve && (
                    <Text style={{ color: '#007AFF', marginTop: 5 }}>Подаётся официантом</Text>
                  )}
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
                  <TouchableOpacity style={styles.modalAddToCartButton} onPress={() => { addToCart(selectedItem); handleCloseModal(); }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Добавить в корзину</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={cartModalVisible} animationType="slide" transparent>
        <View style={styles.cartModalOverlay}>
          <View style={styles.cartModalContent}>
            <View style={styles.cartModalHeader}>
              <Text style={styles.modalTitle}>Корзина</Text>
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
                  <View key={cartItem.id || cartItem.item.id} style={[styles.cartItem, isLocked && { opacity: 0.6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600' }}>{cartItem.item.name}</Text>
                      <Text style={{ color: '#666' }}>{cartItem.item.price} ₽</Text>
                      {!isLocked && (
                        <TextInput
                          style={styles.commentInput}
                          placeholder="Комментарий"
                          value={cartItem.comment}
                          onChangeText={(text) => updateCartItem(cartItem.id || cartItem.item.id, cartItem.quantity, text)}
                        />
                      )}
                      {!cartItem.item.is_selfserve ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                          <Text style={{ fontSize: 14, color: '#333' }}>Курс: </Text>
                          {!isLocked ? (
                            <>
                              <TouchableOpacity onPress={() => updateCourseNumber(cartItem.id || cartItem.item.id, cartItem.course_number - 1)}>
                                <Ionicons name="chevron-down" size={20} color="#007AFF" />
                              </TouchableOpacity>
                              <Text style={{ marginHorizontal: 6, fontSize: 16, fontWeight: '500' }}>{cartItem.course_number}</Text>
                              <TouchableOpacity onPress={() => updateCourseNumber(cartItem.id || cartItem.item.id, cartItem.course_number + 1)}>
                                <Ionicons name="chevron-up" size={20} color="#007AFF" />
                              </TouchableOpacity>
                            </>
                          ) : (
                            <Text style={{ fontSize: 16 }}>{cartItem.course_number}</Text>
                          )}
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                          <Ionicons name="hand-left-outline" size={16} color="#007AFF" />
                          <Text style={{ fontSize: 14, color: '#007AFF', marginLeft: 4 }}>Подаётся официантом</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.quantityControl}>
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
            <View style={styles.cartFooter}>
              <Text style={styles.totalText}>Итого: {getTotalPrice()} ₽</Text>

              {isNewOrderMode && (
                <TouchableOpacity
                  style={[styles.submitOrderButton, { backgroundColor: '#e74c3c', marginBottom: 8 }]}
                  onPress={handleCancelOrder}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Отменить</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.submitOrderButton,
                  (draft.tableIds.length === 0 || cart.length === 0) && { opacity: 0.5 },
                ]}
                onPress={isNewOrderMode ? submitOrder : saveEditedOrder}
                disabled={draft.tableIds.length === 0 || cart.length === 0 || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>
                    {isNewOrderMode ? 'Оформить заказ' : 'Сохранить'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно управления категориями */}
      <Modal animationType="fade" transparent visible={categoryTreeModalVisible} onRequestClose={() => setCategoryTreeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.treeModalHeader}>
              <Text style={styles.modalTitle}>Дерево категорий</Text>
              <TouchableOpacity onPress={() => setCategoryTreeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.treeModalActions}>
              <TouchableOpacity style={styles.treeActionButton} onPress={handleAddCategoryInTree}>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.treeActionButtonText}>Добавить категорию</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={flatCategories}
              renderItem={renderTreeItem}
              keyExtractor={(item) => item.id.toString()}
              style={{ maxHeight: '80%' }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={categoryEditModalVisible} onRequestClose={closeCategoryEditModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={closeCategoryEditModal}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            {(isCreatingCategory || selectedCategory) && (
              <ScrollView style={{ paddingTop: 40 }}>
                <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>
                    {isCreatingCategory ? 'Добавить категорию' : 'Управление категорией'}
                  </Text>

                  {/* Имя категории */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 }}>
                      Название категории
                    </Text>
                    <TextInput
                      style={[
                        styles.commentInput,
                        { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 10 }
                      ]}
                      placeholder="Введите название"
                      value={editingCategoryName}
                      onChangeText={setEditingCategoryName}
                      placeholderTextColor="#999"
                    />
                  </View>

                  {/* Выбор родительской категории */}
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 }}>
                      Родительская категория
                    </Text>
                    <TouchableOpacity
                      style={{
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        backgroundColor: '#f9f9f9'
                      }}
                      onPress={() => setShowParentSelector(!showParentSelector)}
                    >
                      <Text style={{ color: selectedParentId ? '#333' : '#999' }}>
                        {selectedParentId
                          ? availableParentCategories.find(c => c.id === selectedParentId)?.name || 'Не найдена'
                          : 'Выберите категорию'}
                      </Text>
                    </TouchableOpacity>

                    {showParentSelector && (
                      <ScrollView
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: '#ddd',
                          borderRadius: 8,
                          maxHeight: 180,
                        }}
                        nestedScrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                      >
                        <TouchableOpacity
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                          onPress={() => {
                            setSelectedParentId(null);
                            setShowParentSelector(false);
                          }}
                        >
                          <Text style={{ color: selectedParentId === null ? '#007AFF' : '#333' }}>
                            Главная категория
                          </Text>
                        </TouchableOpacity>
                        {availableParentCategories.map(cat => (
                          <TouchableOpacity
                            key={cat.id}
                            style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                            onPress={() => {
                              setSelectedParentId(cat.id);
                              setShowParentSelector(false);
                            }}
                          >
                            <Text style={{ color: selectedParentId === cat.id ? '#007AFF' : '#333' }}>
                              {cat.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>

                  {/* Кнопки действия */}
                  <View style={{ marginTop: 24, gap: 10 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#007AFF',
                        paddingVertical: 12,
                        borderRadius: 8,
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        if (isCreatingCategory) {
                          createCategory(editingCategoryName.trim(), selectedParentId ?? undefined);
                        } else {
                          updateCategory();
                        }
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                        {isCreatingCategory ? 'Создать категорию' : 'Сохранить изменения'}
                      </Text>
                    </TouchableOpacity>

                    {!isCreatingCategory && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#f9991c',
                          paddingVertical: 12,
                          borderRadius: 8,
                          alignItems: 'center'
                        }}
                        onPress={handleAddSubcategory}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 16 }}>
                          Добавить подкатегорию
                        </Text>
                      </TouchableOpacity>
                    )}

                    {!isCreatingCategory && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#e74c3c',
                          paddingVertical: 12,
                          borderRadius: 8,
                          alignItems: 'center'
                        }}
                        onPress={deleteCategory}
                      >
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                          Удалить категорию
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default WaiterMenu;