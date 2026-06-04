import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Modal, ScrollView, TextInput, Keyboard,
  Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import styles from '../design/WaiterMenuStyles';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useOrderDraft } from '../context/OrderDraftContext';
import { getPhotoUrl } from '../utils/imageUrl';
import { useWebSocket } from '../context/WebSocketContext';

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
  is_considered?: boolean;
}

interface CartItem {
  item: MenuItem;
  quantity: number;
  comment: string;
  id?: number;
  course_number: number;
}

type UnifiedListItem =
  | { type: 'category'; data: Category }
  | { type: 'item'; data: MenuItem };


type RootStackParamList = {
  HallMap: { clearDraft?: boolean };
  MenuItemForm: { itemId?: number };
  WaiterMenu: { selectedTableIds?: number[]; orderId?: number; existingPlates?: ExistingPlate[] };
};

const isPlateLockedByStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return status !== 'waiting';
};

const WaiterMenu = () => {
  const { user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { draft, updateCart, clearDraft } = useOrderDraft();

  const orderId = (route.params as any)?.orderId;
  const existingPlates: ExistingPlate[] = (route.params as any)?.existingPlates || [];

  const [orderSaved, setOrderSaved] = useState(false);

  const isEditMode = !!orderId && !orderSaved;
  const isNewOrderMode = !isEditMode && draft.isActive;

  const [categoriesTree, setCategoriesTree] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categoryPath, setCategoryPath] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedImageAspectRatio, setSelectedImageAspectRatio] = useState<number | null>(null);
  const [cartInitialized, setCartInitialized] = useState(false);

  const [categoryTreeModalVisible, setCategoryTreeModalVisible] = useState(false);
  const [categoryEditModalVisible, setCategoryEditModalVisible] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string | undefined>(undefined);
  const [availableParentCategories, setAvailableParentCategories] = useState<Category[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [flatCategories, setFlatCategories] = useState<Array<Category & { depth: number }>>([]);

  const swipeableRefs = new Map();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isFirstFocus = useRef(true);

  const currentCategory = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : null;
  const currentLevelCategories = categoryPath.length === 0
    ? categoriesTree
    : currentCategory?.children || [];

  const prevOrderIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isNewOrderMode) {
      if (draft.cart.length > 0) setCart(draft.cart);
      else setCart([]);
    }
  }, [isNewOrderMode]);

  useEffect(() => {
    if (isNewOrderMode) updateCart(cart);
  }, [cart, isNewOrderMode]);

  useEffect(() => {
    if (!isEditMode || cartInitialized) return;
    if (existingPlates.length === 0) {
      setCartInitialized(true);
      return;
    }
    const initialCart: CartItem[] = existingPlates.map(ep => {
      const menuItem = menuItems.find(m => m.id === ep.plate_id);
      return {
        item: menuItem ?? {
          id: ep.plate_id,
          name: menuItems.length > 0 ? `Блюдо #${ep.plate_id}` : '',
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
      };
    });
    setCart(initialCart);
    if (menuItems.length > 0) setCartInitialized(true);
  }, [isEditMode, menuItems, cartInitialized]);

  useEffect(() => {
    const uri = selectedItem?.photo ? getPhotoUrl(selectedItem.photo) : null;
    if (!uri) { setSelectedImageAspectRatio(null); return; }
    Image.getSize(uri, (w, h) => { if (w && h) setSelectedImageAspectRatio(w / h); }, () => setSelectedImageAspectRatio(null));
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

  useFocusEffect(
    useCallback(() => {
      const isRepeatVisit = !isFirstFocus.current;
      const orderChanged = prevOrderIdRef.current !== orderId;

      if (orderId && (isRepeatVisit || orderChanged)) {
        setOrderSaved(false);
        setCartInitialized(false);
        setCart([]);
      }

      prevOrderIdRef.current = orderId;

      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        loadData(false);
      } else {
        loadData(true);
      }
    }, [orderId])
  );

  const flattenMenuByCategories = useCallback((): UnifiedListItem[] => {
    const result: UnifiedListItem[] = [];

    const walk = (category: Category) => {
      result.push({ type: 'category', data: category });

      const items = menuItems.filter(i => i.category === category.id);
      items.forEach(item => result.push({ type: 'item', data: item }));

      category.children?.forEach(child => walk(child));
    };

    categoriesTree.forEach(root => walk(root));

    const uncategorized = menuItems.filter(i => !i.category || i.category === 0);
      if (uncategorized.length > 0) {
        result.push({
          type: 'category',
          data: { id: -1, name: 'Без категории', parent_category: null, children: [] }
        });

        uncategorized.forEach(item =>
          result.push({ type: 'item', data: item })
        );
      }

    return result;
  }, [categoriesTree, menuItems]);


  const filteredItems = useMemo(() => {
    if (currentCategory) {
      return menuItems.filter(item => item.category === currentCategory.id);
    }
    return flattenMenuByCategories();
  }, [currentCategory, menuItems, flattenMenuByCategories]);


  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      await Promise.all([fetchCategories(), fetchMenuItems()]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsInitialLoad(false);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/menu/categories/tree');
      const data: Category[] = response.data;
      const deduplicateChildren = (cat: Category) => {
        if (cat.children?.length > 0) {
          cat.children = cat.children.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
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
      setMenuItems(isAdmin ? data : data.filter(item => item.is_available));
    } catch (error) {
      console.error('Ошибка загрузки меню:', error);
    }
  };

  const handleRefresh = () => { setRefreshing(true); loadData(true); };

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (data.type === 'categories_update' || data.type === 'plates_update') loadData();
    });
    return unsubscribe;
  }, [addHandler, loadData]);

  const handleSelectCategory = (category: Category) => setCategoryPath([...categoryPath, category]);
  const handleBack = () => setCategoryPath(categoryPath.slice(0, -1));
  const handleResetCategories = () => setCategoryPath([]);

  const handleItemPress = (item: MenuItem) => { setSelectedItem(item); setModalVisible(true); };
  const handleCloseModal = () => { setModalVisible(false); setTimeout(() => setSelectedItem(null), 300); };

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
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось удалить позицию');
    }
  };

  const handleAddItem = () => {
    if (!isAdmin) { Alert.alert('Доступ запрещен', 'Только администратор может добавлять позиции'); return; }
    navigation.navigate('MenuItemForm', { itemId: undefined });
  };

  const buildFlatCategories = (tree: Category[], depth = 0): Array<Category & { depth: number }> =>
    tree.reduce<Array<Category & { depth: number }>>((result, category) => {
      result.push({ ...category, depth });
      if (category.children?.length > 0) result.push(...buildFlatCategories(category.children, depth + 1));
      return result;
    }, []);

  const getAvailableParents = (excludeId: number | null, tree: Category[]): Category[] => {
    const result: Category[] = [];
    const walk = (node: Category) => {
      if (excludeId !== null && node.id === excludeId) return;
      result.push(node);
      node.children?.forEach(walk);
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
    setAvailableParentCategories(getAvailableParents(category.id, categoriesTree));
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

  const createCategory = async (name: string, parentId?: number) => {
    if (!name) { Alert.alert('Ошибка', 'Название категории не может быть пустым'); return; }
    try {
      await api.post('/menu/categories/', { name, parent_category: parentId || null });
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
    if (!selectedCategory || !(editingCategoryName ?? '').trim()) {
      if (!(editingCategoryName ?? '').trim()) Alert.alert('Ошибка', 'Название категории не может быть пустым');
      return;
    }
    if (editingCategoryName === selectedCategory.name && selectedParentId === selectedCategory.parent_category) {
      setCategoryEditModalVisible(false); setSelectedCategory(null); return;
    }
    try {
      await api.put(`/menu/categories/${selectedCategory.id}`, {
        name: (editingCategoryName ?? '').trim(),
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
    Alert.alert('Удалить категорию', `Вы уверены, что хотите удалить категорию "${selectedCategory.name}"?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/menu/categories/${selectedCategory.id}`);
            await fetchCategories();
            setCategoryEditModalVisible(false);
            setSelectedCategory(null);
            setCategoryTreeModalVisible(true);
          } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось удалить категорию');
          }
        }
      }
    ]);
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
        const editableIndex = prev.findIndex(ci => {
          if (ci.item.id !== item.id) return false;
          if (ci.id === undefined) return true;
          const ep = existingPlates.find(p => p.id === ci.id);
          return ep ? !isPlateLockedByStatus(ep.current_status) : true;
        });

        if (editableIndex !== -1) {
          return prev.map((ci, idx) =>
            idx === editableIndex ? { ...ci, quantity: ci.quantity + 1 } : ci
          );
        }
        return [...prev, { item, quantity: 1, comment: '', id: undefined, course_number: 1 }];
      }
      const existing = prev.find(i => i.item.id === item.id);
      if (existing) {
        return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { item, quantity: 1, comment: '', course_number: 1 }];
    });
  };

  const updateCartItem = (idOrPlateId: number, quantity: number, comment?: string) => {
    setCart(prev => prev.map(i => {
      const compareId = i.id ?? i.item.id;
      if (compareId === idOrPlateId) {
        return { ...i, quantity: Math.max(1, quantity), comment: comment ?? i.comment };
      }
      return i;
    }));
  };

  const updateCourseNumber = (idOrPlateId: number, newCourse: number) => {
    const clamped = Math.min(10, Math.max(1, newCourse));
    setCart(prev => prev.map(i => {
      const compareId = i.id ?? i.item.id;
      return compareId === idOrPlateId ? { ...i, course_number: clamped } : i;
    }));
  };

  const removeCartItem = (idOrPlateId: number) => {
    if (isEditMode) {
      const cartItem = cart.find(i => (i.id ?? i.item.id) === idOrPlateId);
      if (cartItem?.id !== undefined) {
        const ep = existingPlates.find(p => p.id === cartItem.id);
        if (ep && isPlateLockedByStatus(ep.current_status)) {
          Alert.alert('Нельзя удалить', 'Это блюдо уже готовится или готово');
          return;
        }
      }
    }
    setCart(prev => prev.filter(i => (i.id ?? i.item.id) !== idOrPlateId));
  };

  const getTotalPrice = () => cart.reduce((sum, i) => sum + i.item.price * i.quantity, 0);

  const validateCourses = (items: CartItem[]): string | null => {
    const filtered = items.filter(i => !i.item.is_selfserve);
    if (filtered.length === 0) return null;
    const courseNumbers = Array.from(new Set(filtered.map(i => i.course_number))).sort((a, b) => a - b);
    if (courseNumbers[0] !== 1) return 'Курсы должны начинаться с 1';
    const maxCourse = courseNumbers[courseNumbers.length - 1];
    if (courseNumbers.length !== maxCourse) {
      const missing: number[] = [];
      for (let c = 1; c <= maxCourse; c++) if (!courseNumbers.includes(c)) missing.push(c);
      return `Пропущены курсы: ${missing.join(', ')}`;
    }
    return null;
  };

  const handleCancelOrder = () => {
    clearDraft();
    setCart([]);
    setCartModalVisible(false);
    navigation.navigate('Зал', { clearDraft: true });
  };

  const submitOrder = async () => {
    if (cart.length === 0) { Alert.alert('Корзина пуста', 'Добавьте хотя бы одно блюдо'); return; }
    if (draft.tableIds.length === 0) { Alert.alert('Нет столов', 'Вернитесь к схеме зала и выберите столы'); return; }
    const validationError = validateCourses(cart);
    if (validationError) { Alert.alert('Ошибка курсов', validationError); return; }
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
      clearDraft();
      setCart([]);
      setCartModalVisible(false);
      navigation.navigate('Зал', { clearDraft: true });
    } catch (error: any) {
      if (error.response?.status === 409) {
        Alert.alert('Стол занят', 'Кто-то уже создал заказ для этого стола.');
        navigation.navigate('Зал', { clearDraft: true });
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
    if (validationError) { Alert.alert('Ошибка курсов', validationError); return; }
    setSubmitting(true);
    try {
      const existingIds = existingPlates.map(ep => ep.id);
      const currentIds = cart.filter(ci => ci.id !== undefined).map(ci => ci.id!);

      const toDelete = existingIds.filter(id => !currentIds.includes(id));
      const toUpdate = cart.filter(ci => ci.id !== undefined);
      const toCreate = cart.filter(ci => ci.id === undefined);

      for (const id of toDelete) {
        const ep = existingPlates.find(p => p.id === id);
        if (ep && !isPlateLockedByStatus(ep.current_status)) {
          await api.delete(`/orders/plates/${id}`);
        }
      }

      for (const ci of toUpdate) {
        const ep = existingPlates.find(p => p.id === ci.id);
        if (!ep || isPlateLockedByStatus(ep.current_status)) continue;
        await api.put(`/orders/plates/${ci.id}`, {
          count: ci.quantity,
          comment: ci.comment,
          course_number: ci.course_number,
        });
      }

      for (const ci of toCreate) {
        await api.post(`/orders/${orderId}/plates`, {
          plate_id: ci.item.id,
          count: ci.quantity,
          comment: ci.comment,
          course_number: ci.course_number,
          initial_status: 'waiting',
        });
      }

      setCartModalVisible(false);
      setCart([]);
      setOrderSaved(true);
      navigation.replace('MenuList', {
        orderId: undefined,
        existingPlates: [],
        selectedTableIds: [],
      });
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

  const renderTreeItem = ({ item }: { item: Category & { depth: number } }) => (
    <View style={[styles.treeItem, { paddingLeft: 16 + item.depth * 16 }]}>
      <TouchableOpacity activeOpacity={0.7} style={styles.treeItemRow} onPress={() => handleTreeItemPress(item)}>
        <View style={{ marginRight: 10, padding: 8 }}>
          <Ionicons name="create-outline" size={20} color="#999" />
        </View>
        <Text style={styles.treeItemText}>{item.name}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUnifiedItem = ({ item }: { item: UnifiedListItem | MenuItem }) => {
    if ('type' in item) {
      if (item.type === 'category') {
        return (
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryHeaderText}>{item.data.name}</Text>
          </View>
        );
      }
      return renderMenuItem({ item: item.data });
    }
    return renderMenuItem({ item });
  };

  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const content = (
      <View style={[styles.menuItemContent, !item.is_available && { opacity: 0.3 }]}>
        <TouchableOpacity style={{ flex: 1, flexDirection: 'row' }} onPress={() => handleItemPress(item)} activeOpacity={0.7}>
          <View style={styles.menuItemInfo}>
            <Text style={styles.menuItemName}>{item.name}{item.is_selfserve ? ' 🧑‍🍳' : ''}</Text>
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
          renderRightActions={() => (
            <View style={styles.swipeActions}>
              <RectButton style={[styles.swipeCircleButton, styles.editButton]} onPress={() => handleEditItem(item)}>
                <View style={styles.swipeButtonContent}><Ionicons name="create-outline" size={22} color="#fff" /></View>
              </RectButton>
              <RectButton style={[styles.swipeCircleButton, styles.deleteButton]} onPress={() => handleDeleteItem(item)}>
                <View style={styles.swipeButtonContent}><Ionicons name="trash-outline" size={22} color="#fff" /></View>
              </RectButton>
            </View>
          )}
          overshootRight={false}
        >
          <View style={styles.menuItem}>{content}</View>
        </Swipeable>
      );
    }
    return <View style={styles.menuItem}>{content}</View>;
  };

  const totalItemsCount =
    currentCategory
      ? (filteredItems as MenuItem[]).length
      : menuItems.length;

  if (isInitialLoad) {
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
              <Text style={{ color: '#007AFF', fontWeight: '500' }}>Столов: {draft.tableIds.length}</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSubtitle}>
          {categoryPath.length > 0 ? categoryPath.map(c => c.name).join(' / ') : 'Все блюда'} • {totalItemsCount} позиций
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
        data={filteredItems as any}
        renderItem={renderUnifiedItem}
        keyExtractor={(item, index) => {
          if ('type' in item) {
            return item.type === 'category'
              ? `cat-${item.data.id}-${index}`
              : `item-${item.data.id}-${index}`;
          }
          return `item-${(item as MenuItem).id}-${index}`;
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} />}
        contentContainerStyle={styles.menuList}
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
          <View style={styles.addButtonInner}><Ionicons name="add" size={28} color="#fff" /></View>
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
                    style={[styles.modalImage, selectedImageAspectRatio ? { aspectRatio: selectedImageAspectRatio } : styles.modalImageFallback]}
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
                  {selectedItem.is_selfserve && <Text style={{ color: '#007AFF', marginTop: 5 }}>Подаётся официантом</Text>}
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

            <FlatList
              data={cart}
              keyExtractor={(item) => (item.id !== undefined ? `existing-${item.id}` : `new-${item.item.id}`)}
              style={{ flexShrink: 1 }}
              renderItem={({ item: cartItem }) => {
                const ep = cartItem.id !== undefined
                  ? existingPlates.find(p => p.id === cartItem.id)
                  : null;
                const isLocked = ep ? isPlateLockedByStatus(ep.current_status) : false;

                return (
                  <View style={[styles.cartItem, isLocked && { opacity: 0.6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600' }}>{cartItem.item.name || `Блюдо #${cartItem.item.id}`}</Text>
                      <Text style={{ color: '#666' }}>{cartItem.item.price} ₽</Text>

                      {isLocked && ep && (
                        <Text style={{ fontSize: 12, color: '#e67e22', marginTop: 4 }}>
                          Статус: {ep.current_status}
                        </Text>
                      )}

                      {!isLocked && (
                        <TextInput
                          style={styles.commentInput}
                          placeholder="Комментарий"
                          placeholderTextColor="#999"
                          value={cartItem.comment}
                          onChangeText={(text) => updateCartItem(cartItem.id ?? cartItem.item.id, cartItem.quantity, text)}
                        />
                      )}

                      {!cartItem.item.is_selfserve ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                          <Text style={{ fontSize: 14, color: '#333' }}>Курс: </Text>
                          {!isLocked ? (
                            <>
                              <TouchableOpacity onPress={() => updateCourseNumber(cartItem.id ?? cartItem.item.id, cartItem.course_number - 1)}>
                                <Ionicons name="chevron-down" size={20} color="#007AFF" />
                              </TouchableOpacity>
                              <Text style={{ marginHorizontal: 6, fontSize: 16, fontWeight: '500' }}>{cartItem.course_number}</Text>
                              <TouchableOpacity onPress={() => updateCourseNumber(cartItem.id ?? cartItem.item.id, cartItem.course_number + 1)}>
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
                          <TouchableOpacity onPress={() => updateCartItem(cartItem.id ?? cartItem.item.id, cartItem.quantity - 1)}>
                            <Ionicons name="remove-circle-outline" size={28} color="#007AFF" />
                          </TouchableOpacity>
                          <Text style={{ marginHorizontal: 8, fontSize: 16 }}>{cartItem.quantity}</Text>
                          <TouchableOpacity onPress={() => updateCartItem(cartItem.id ?? cartItem.item.id, cartItem.quantity + 1)}>
                            <Ionicons name="add-circle-outline" size={28} color="#007AFF" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeCartItem(cartItem.id ?? cartItem.item.id)} style={{ marginLeft: 12 }}>
                            <Ionicons name="trash-outline" size={22} color="#e74c3c" />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={{ color: '#999', fontSize: 12 }}>Нельзя изменить</Text>
                      )}
                    </View>
                  </View>
                );
              }}
            />

            <View style={styles.cartFooter}>
              <View style={styles.footerLeft}>
                <Text style={styles.totalText}>Итого: {getTotalPrice()} ₽</Text>
              </View>
              <View style={styles.footerRight}>
                {isNewOrderMode && (
                  <TouchableOpacity
                    style={[styles.footerButton, { backgroundColor: '#e74c3c' }]}
                    onPress={handleCancelOrder}
                  >
                    <Text style={styles.footerButtonText}>Отменить</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.footerButton,
                    ((isNewOrderMode && (draft.tableIds.length === 0 || cart.length === 0))
                      || (isEditMode && cart.length === 0)
                      || submitting) && { opacity: 0.5 },
                  ]}
                  onPress={isNewOrderMode ? submitOrder : saveEditedOrder}
                  disabled={
                    (isNewOrderMode && (draft.tableIds.length === 0 || cart.length === 0))
                    || (isEditMode && cart.length === 0)
                    || submitting
                  }
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.footerButtonText}>
                        {isNewOrderMode ? 'Оформить' : 'Сохранить'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={categoryTreeModalVisible} onRequestClose={() => setCategoryTreeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.treeModalHeader}>
              <View style={{ width: 34 }} />
              <Text style={styles.modalTitle}>Дерево категорий</Text>
              <TouchableOpacity onPress={() => setCategoryTreeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.treeModalActions}>
              <TouchableOpacity style={styles.treeActionButton} onPress={handleAddCategoryInTree}>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.treeActionButtonText}>Добавить</Text>
              </TouchableOpacity>
            </View>
            <FlatList data={flatCategories} renderItem={renderTreeItem} keyExtractor={(item) => item.id.toString()} style={{ maxHeight: '100%' }} />
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
              <ScrollView style={{ paddingTop: 15 }}>
                <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>
                    {isCreatingCategory ? 'Добавить категорию' : 'Редактирование категории'}
                  </Text>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 }}>Название категории</Text>
                    <TextInput
                      style={[styles.commentInput, { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 10 }]}
                      placeholder="Введите название"
                      value={editingCategoryName}
                      onChangeText={setEditingCategoryName}
                      placeholderTextColor="#999"
                    />
                  </View>
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 }}>Родительская категория</Text>
                    <TouchableOpacity
                      style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#f9f9f9' }}
                      onPress={() => setShowParentSelector(!showParentSelector)}
                    >
                      <Text style={{ color: selectedParentId ? '#333' : '#999' }}>
                        {selectedParentId ? availableParentCategories.find(c => c.id === selectedParentId)?.name || 'Не найдена' : 'Выберите категорию'}
                      </Text>
                    </TouchableOpacity>
                    {showParentSelector && (
                      <ScrollView style={{ marginTop: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                          onPress={() => { setSelectedParentId(null); setShowParentSelector(false); }}
                        >
                          <Text style={{ color: selectedParentId === null ? '#007AFF' : '#333' }}>Основная категория</Text>
                        </TouchableOpacity>
                        {availableParentCategories.map(cat => (
                          <TouchableOpacity
                            key={cat.id}
                            style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                            onPress={() => { setSelectedParentId(cat.id); setShowParentSelector(false); }}
                          >
                            <Text style={{ color: selectedParentId === cat.id ? '#007AFF' : '#333' }}>{cat.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                  <View style={{ marginTop: 24, gap: 10 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => isCreatingCategory ? createCategory((editingCategoryName ?? '').trim(), selectedParentId ?? undefined) : updateCategory()}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                        {isCreatingCategory ? 'Создать категорию' : 'Сохранить изменения'}
                      </Text>
                    </TouchableOpacity>
                    {!isCreatingCategory && (
                      <TouchableOpacity style={{ backgroundColor: '#e74c3c', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }} onPress={deleteCategory}>
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Удалить категорию</Text>
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