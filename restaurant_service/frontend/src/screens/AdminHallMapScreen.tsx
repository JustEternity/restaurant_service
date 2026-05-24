import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  TextInput,
  LayoutChangeEvent,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../context/AuthContext';
import { useOrderDraft } from '../context/OrderDraftContext';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import styles from '../design/HallMapStyles';
import { getPhotoUrl } from '../utils/imageUrl';

const { width, height } = Dimensions.get('window');

interface Table {
  id: number;
  number: number;
  pos_x: number;
  pos_y: number;
  status: string;
  is_available: boolean;
}

interface OrderPlate {
  id: number;
  plate_name: string;
  count: number;
  price: number;
  current_status: string;
  comment: string | null;
}

interface Order {
  id: number;
  status: string;
  waiter_name: string;
  table_numbers: number[];
  plates: OrderPlate[];
  timestart: string;
}

type RootStackParamList = {
  HallMap: { clearDraft?: boolean };
  WaiterMenu: { selectedTableIds?: number[] };
  'Меню': { screen: string };
};

const HallMap = () => {
  const { user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const isAdmin = user?.role === 'admin';

  const { draft, setTableIds, clearDraft, activateDraft } = useOrderDraft();

  const [tables, setTables] = useState<Table[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>(draft.tableIds);
  const [readyTableIds, setReadyTableIds] = useState<Set<number>>(new Set());

  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddingMode, setIsAddingMode] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);

  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [tableSize, setTableSize] = useState<number>(30);
  const [tempTableSize, setTempTableSize] = useState<string>('30');
  const [savingSize, setSavingSize] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  const [imageNaturalSizeState, setImageNaturalSizeState] = useState<{ width: number; height: number } | null>(null);
  const [mapLayoutState, setMapLayoutState] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const imageNaturalSize = useSharedValue<{ width: number; height: number } | null>(null);
  const mapLayout = useSharedValue<{ width: number; height: number }>({ width: 0, height: 0 });
  const mapScale = useSharedValue(1);
  const mapTranslateX = useSharedValue(0);
  const mapTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const minFitScale = useSharedValue(1);

  useEffect(() => {
    imageNaturalSize.value = imageNaturalSizeState;
  }, [imageNaturalSizeState]);

  useEffect(() => {
    mapLayout.value = mapLayoutState;
  }, [mapLayoutState]);

  const getImageSize = (url: string) => {
    Image.getSize(url, (w, h) => {
      const size = { width: w, height: h };
      setImageNaturalSizeState(size);
      imageNaturalSize.value = size;
    }, () => console.warn('Не удалось получить размеры изображения'));
  };

  const handleImageLoad = (event: any) => {
    const { width: w, height: h } = event.nativeEvent.source ?? {};
    if (w && h) {
      const size = { width: w, height: h };
      setImageNaturalSizeState(size);
      imageNaturalSize.value = size;
    }
  };

  const recalcFit = useCallback(() => {
    'worklet';
    if (imageNaturalSize.value && mapLayout.value.width > 0 && mapLayout.value.height > 0) {
      const scaleX = mapLayout.value.width / imageNaturalSize.value.width;
      const scaleY = mapLayout.value.height / imageNaturalSize.value.height;
      const fitScale = Math.min(scaleX, scaleY);
      const minScale = fitScale * 0.96;
      mapScale.value = fitScale;
      minFitScale.value = minScale;
      mapTranslateX.value = 0;
      mapTranslateY.value = 0;
    }
  }, []);

  useEffect(() => {
    recalcFit();
  }, [imageNaturalSizeState, mapLayoutState, recalcFit]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/hallmap/settings');
      if (res.data.hallmap_image) {
        setBackgroundImage(res.data.hallmap_image);
        const fullUrl = getPhotoUrl(res.data.hallmap_image);
        if (fullUrl) getImageSize(fullUrl);
      }
      const size = Number(res.data.table_size) || 30;
      setTableSize(size);
      setTempTableSize(String(size));
    } catch (error) {
      console.error('Ошибка загрузки настроек схемы', error);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const onMapWrapperLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMapLayoutState({ width, height });
    mapLayout.value = { width, height };
    recalcFit();
  };

  const getClampedTranslation = (tx: number, ty: number, scale: number) => {
    'worklet';
    if (!imageNaturalSize.value || mapLayout.value.width === 0 || mapLayout.value.height === 0)
      return { tx, ty };
    const imgW = imageNaturalSize.value.width * scale;
    const imgH = imageNaturalSize.value.height * scale;

    const centeredTx = (mapLayout.value.width - imgW) / 2;
    const centeredTy = (mapLayout.value.height - imgH) / 2;

    if (scale <= minFitScale.value + 0.001) {
      return { tx: 0, ty: 0 };
    }

    const clampedX = imgW <= mapLayout.value.width
      ? 0
      : Math.min(Math.max(tx, centeredTx), -centeredTx);
    const clampedY = imgH <= mapLayout.value.height
      ? 0
      : Math.min(Math.max(ty, centeredTy), -centeredTy);

    return {
      tx: clampedX,
      ty: clampedY,
    };
  };

  const pinchGesture = Gesture.Pinch()
    .enabled(!isEditMode && !isAddingMode)
    .onStart((event) => {
      savedScale.value = mapScale.value;
      savedTranslateX.value = mapTranslateX.value;
      savedTranslateY.value = mapTranslateY.value;
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const newScale = Math.max(minFitScale.value, savedScale.value * event.scale);
      const scaleRatio = newScale / savedScale.value;
      mapScale.value = newScale;
      const imgW = imageNaturalSize.value ? imageNaturalSize.value.width * newScale : 0;
      const imgH = imageNaturalSize.value ? imageNaturalSize.value.height * newScale : 0;
      const centerOffsetX = (mapLayout.value.width - imgW) / 2;
      const centerOffsetY = (mapLayout.value.height - imgH) / 2;
      const focalAdjustedX = focalX.value - centerOffsetX;
      const focalAdjustedY = focalY.value - centerOffsetY;
      mapTranslateX.value = focalAdjustedX - (focalAdjustedX - savedTranslateX.value) * scaleRatio;
      mapTranslateY.value = focalAdjustedY - (focalAdjustedY - savedTranslateY.value) * scaleRatio;
      const clamped = getClampedTranslation(mapTranslateX.value, mapTranslateY.value, mapScale.value);
      mapTranslateX.value = clamped.tx;
      mapTranslateY.value = clamped.ty;
    })
    .onEnd(() => {
      const { tx, ty } = getClampedTranslation(mapTranslateX.value, mapTranslateY.value, mapScale.value);
      mapTranslateX.value = withTiming(tx, { duration: 300 });
      mapTranslateY.value = withTiming(ty, { duration: 300 });
    });

  const panGesture = Gesture.Pan()
    .enabled(!isEditMode && !isAddingMode)
    .onStart(() => {
      savedTranslateX.value = mapTranslateX.value;
      savedTranslateY.value = mapTranslateY.value;
    })
    .onUpdate((event) => {
      mapTranslateX.value = savedTranslateX.value + event.translationX;
      mapTranslateY.value = savedTranslateY.value + event.translationY;
      const clamped = getClampedTranslation(mapTranslateX.value, mapTranslateY.value, mapScale.value);
      mapTranslateX.value = clamped.tx;
      mapTranslateY.value = clamped.ty;
    })
    .onEnd(() => {
      const { tx, ty } = getClampedTranslation(mapTranslateX.value, mapTranslateY.value, mapScale.value);
      mapTranslateX.value = withTiming(tx, { duration: 300 });
      mapTranslateY.value = withTiming(ty, { duration: 300 });
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: mapScale.value },
      { translateX: mapTranslateX.value },
      { translateY: mapTranslateY.value },
    ],
  }));

  const getOriginalCoords = (screenX: number, screenY: number) => {
    'worklet';
    if (!imageNaturalSize.value || mapLayout.value.width === 0 || mapLayout.value.height === 0) {
      return { x: screenX, y: screenY };
    }
    const scale = mapScale.value;
    const tx = mapTranslateX.value;
    const ty = mapTranslateY.value;
    const imgW = imageNaturalSize.value.width * scale;
    const imgH = imageNaturalSize.value.height * scale;
    const centerOffsetX = (mapLayout.value.width - imgW) / 2;
    const centerOffsetY = (mapLayout.value.height - imgH) / 2;
    return {
      x: (screenX - centerOffsetX - tx) / scale,
      y: (screenY - centerOffsetY - ty) / scale,
    };
  };

  useEffect(() => { setSelectedTableIds(draft.tableIds); }, [draft.tableIds]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const params = route.params as any;
      if (params?.clearDraft) {
        clearDraft();
        setSelectedTableIds([]);
        navigation.setParams({ clearDraft: undefined });
      }
    });
    return unsubscribe;
  }, [navigation, clearDraft]);

  const safeSetTables = (updater: Table[] | ((prev: Table[]) => Table[])) => {
    setTables((prev: Table[]) => {
      const current = Array.isArray(prev) ? prev : [];
      const newState = typeof updater === 'function' ? updater(current) : updater;
      return Array.isArray(newState) ? newState : [];
    });
  };

  const loadTables = useCallback(async (): Promise<Table[]> => {
    try {
      const response = await api.get('/tables/');
      const newTables: Table[] = response.data;
      safeSetTables(newTables);
      return newTables;
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить столы');
      safeSetTables([]);
      return [];
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const loadReadyTables = useCallback(async (currentTables: Table[]) => {
    if (isAdmin || !user) return;
    try {
      const res = await api.get(`/orders/?waiter_id=${user.id}&status=active`);
      const orders: Order[] = res.data;
      const readyNumbers = new Set<number>();
      orders.forEach(order => {
        const hasReady = order.plates.some(plate => plate.current_status === 'ready');
        if (hasReady) order.table_numbers.forEach(num => readyNumbers.add(num));
      });
      const ids = new Set<number>();
      currentTables.forEach(table => {
        if (readyNumbers.has(table.number)) ids.add(table.id);
      });
      setReadyTableIds(ids);
    } catch (error) { console.error('Ошибка загрузки готовых заказов', error); }
  }, [user, isAdmin]);

  const manualRefresh = useCallback(async () => {
    const newTables = await loadTables();
    await loadReadyTables(newTables);
  }, [loadTables, loadReadyTables]);

  useEffect(() => { manualRefresh(); }, [manualRefresh]);

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (data.type === 'plate_ready' || data.type === 'plate_status_changed' ||
          data.type === 'order_completed' || data.type === 'order_created' ||
          data.type === 'order_updated') {
        manualRefresh();
      }
    });
    return unsubscribe;
  }, [addHandler, manualRefresh]);

  const updateTablePosition = async (id: number, pos_x: number, pos_y: number) => {
    if (!isAdmin) return;
    try { await api.put(`/tables/${id}`, { pos_x, pos_y }); }
    catch (error) { console.error('Ошибка сохранения позиции стола:', error); }
  };

  const handleTableDragEnd = (tableId: number, newX: number, newY: number) => {
    if (!isAdmin || !imageNaturalSizeState) return;
    const clampedX = Math.min(Math.max(newX, 0), imageNaturalSizeState.width);
    const clampedY = Math.min(Math.max(newY, 0), imageNaturalSizeState.height);
    updateTablePosition(tableId, clampedX, clampedY);
    safeSetTables(prev =>
      prev.map(t => (t.id === tableId ? { ...t, pos_x: clampedX, pos_y: clampedY } : t))
    );
  };

  const createTableAt = async (x: number, y: number) => {
    if (!isAdmin || !imageNaturalSizeState) return;
    const clampedX = Math.min(Math.max(x, 0), imageNaturalSizeState.width);
    const clampedY = Math.min(Math.max(y, 0), imageNaturalSizeState.height);
    try {
      const newNumber = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1;
      const response = await api.post('/tables/', {
        number: newNumber, pos_x: clampedX, pos_y: clampedY,
        status: 'free', is_available: true,
      });
      const newTable: Table = response.data;
      if (newTable && newTable.id) safeSetTables(prev => [...prev, newTable]);
    } catch (error) { Alert.alert('Ошибка', 'Не удалось создать стол'); }
  };

  const handleMapPress = (event: any) => {
    if (!isAdmin || !isAddingMode) return;
    const { locationX, locationY } = event.nativeEvent;
    const { x, y } = getOriginalCoords(locationX, locationY);
    createTableAt(x, y);
    setIsAddingMode(false);
  };

  const deleteTable = (id: number) => {
    if (!isAdmin) return;
    Alert.alert('Удалить стол', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/tables/${id}`);
            safeSetTables(prev => prev.filter(t => t.id !== id));
            setSelectedTableIds(prev => prev.filter(tid => tid !== id));
            setTableIds(selectedTableIds.filter(tid => tid !== id));
          } catch (error) { Alert.alert('Ошибка', 'Не удалось удалить стол'); }
        },
      },
    ]);
  };

  const showOrderForTable = async (table: Table) => {
    setLoadingOrder(true);
    try {
      const res = await api.get(`/orders/?status=active&table_id=${table.id}`);
      const orders: Order[] = res.data;
      if (orders.length > 0) {
        setSelectedOrder(orders[0]);
        setOrderModalVisible(true);
      } else {
        Alert.alert('Информация', 'Нет активного заказа для этого стола');
      }
    } catch (error) { Alert.alert('Ошибка', 'Не удалось загрузить заказ'); }
    finally { setLoadingOrder(false); }
  };

  const toggleTableSelection = (table: Table) => {
    if (table.status === 'occupied' || readyTableIds.has(table.id)) {
      showOrderForTable(table);
      return;
    }
    if (!isAdmin) {
      setSelectedTableIds(prev => {
        const newSelection = prev.includes(table.id)
          ? prev.filter(tid => tid !== table.id)
          : [...prev, table.id];
        setTableIds(newSelection);
        return newSelection;
      });
    }
  };

  const clearSelection = () => { setSelectedTableIds([]); setTableIds([]); };

  const handleCreateOrderPress = () => {
    if (selectedTableIds.length === 0) return;
    if (!isAdmin) {
      activateDraft();
      navigation.navigate('Меню', { screen: 'MenuList' });
    }
  };

  const handleContinueOrder = () => {
    if (!isAdmin) navigation.navigate('Меню', { screen: 'MenuList' });
  };

  const saveTableSize = async () => {
    const size = parseFloat(tempTableSize) || 30;
    setSavingSize(true);
    try {
      await api.put('/hallmap/settings', { table_size: size });
      setTableSize(size);
      Alert.alert('Готово', 'Размер столов обновлён');
    } catch (error) { Alert.alert('Ошибка', 'Не удалось обновить размер'); }
    finally { setSavingSize(false); }
  };

  const pickBackground = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Нужен доступ к фото'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1,
    });
    if (result.canceled) return;

    const manipResult = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const formData = new FormData();
    formData.append('file', {
      uri: manipResult.uri, name: 'floorplan.jpg', type: 'image/jpeg',
    } as any);

    setUploadingBg(true);
    try {
      const res = await api.post('/hallmap/upload-background', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBackgroundImage(res.data.url);
      Alert.alert('Готово', 'Фон схемы обновлён');
    } catch (error: any) { Alert.alert('Ошибка', error.message); }
    finally { setUploadingBg(false); }
  };

  const getOrderStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Активен';
      case 'completed': return 'Завершён';
      case 'cancelled': return 'Отменён';
      default: return status;
    }
  };

  const getCookingStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return 'Ожидает';
      case 'preparing': return 'Готовится';
      case 'ready': return 'Готово';
      case 'served': return 'Подано';
      default: return status;
    }
  };

  const TableItem = ({ table, draggable }: { table: Table; draggable?: boolean }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const context = useSharedValue({ x: 0, y: 0 });

    const panGesture = Gesture.Pan()
      .enabled(!!draggable && isEditMode)
      .onStart(() => { context.value = { x: translateX.value, y: translateY.value }; })
      .onUpdate((event) => {
        translateX.value = context.value.x + event.translationX;
        translateY.value = context.value.y + event.translationY;
      })
      .onEnd(() => {
        const newPosX = table.pos_x + translateX.value;
        const newPosY = table.pos_y + translateY.value;
        runOnJS(handleTableDragEnd)(table.id, newPosX, newPosY);
        translateX.value = 0;
        translateY.value = 0;
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    }));

    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.tableContainer,
            {
              position: 'absolute',
              left: table.pos_x - tableSize,
              top: table.pos_y - tableSize,
              width: tableSize * 2,
              height: tableSize * 2,
              borderRadius: tableSize,
            },
            animatedStyle,
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => toggleTableSelection(table)}
            onLongPress={() => draggable && deleteTable(table.id)}
            style={{ flex: 1 }}
          >
            <View
              style={[
                styles.table,
                table.status === 'occupied' && !readyTableIds.has(table.id) && styles.tableOccupied,
                readyTableIds.has(table.id) && styles.tableReady,
                selectedTableIds.includes(table.id) && !isAdmin && styles.tableSelected,
                { flex: 1 },
              ]}
            >
              <Text style={styles.tableNumber}>{table.number}</Text>
              <Text style={styles.tableStatus}>
                {readyTableIds.has(table.id)
                  ? 'Готово подать'
                  : table.status === 'free'
                  ? 'Свободен'
                  : 'Занят'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    );
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Загрузка схемы зала...</Text>
      </View>
    );
  }

  const safeTables = Array.isArray(tables) ? tables : [];
  const imgSize = imageNaturalSizeState || { width: 0, height: 0 };

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerButtons}>
          {selectedTableIds.length > 0 && !isAdmin && (
            <TouchableOpacity style={styles.clearButton} onPress={clearSelection}>
              <Ionicons name="close-circle" size={24} color="#ff3b30" />
            </TouchableOpacity>
          )}
          {isAdmin && (
            <>
              <TouchableOpacity
                style={[styles.editButton, isEditMode && styles.editButtonActive]}
                onPress={() => {
                  setIsEditMode(!isEditMode);
                  if (isAddingMode) setIsAddingMode(false);
                }}
              >
                <Ionicons name="move-outline" size={22} color={isEditMode ? '#fff' : '#007AFF'} />
              </TouchableOpacity>
              {isEditMode && (
                <>
                  <TouchableOpacity
                    style={[styles.addButton, isAddingMode && styles.addButtonActive]}
                    onPress={() => setIsAddingMode(!isAddingMode)}
                  >
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                  <View style={styles.sizeRow}>
                    <TextInput
                      style={styles.sizeInput}
                      value={tempTableSize}
                      onChangeText={setTempTableSize}
                      keyboardType="numeric"
                      placeholder="30"
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity
                      style={styles.sizeSaveButton}
                      onPress={saveTableSize}
                      disabled={savingSize}
                    >
                      {savingSize ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.sizeSaveButtonText}>OK</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.bgButton}
                    onPress={pickBackground}
                    disabled={uploadingBg}
                  >
                    {uploadingBg ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Ionicons name="image-outline" size={22} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
          {!isAdmin && (
            <TouchableOpacity style={styles.refreshButton} onPress={manualRefresh}>
              <Ionicons name="refresh" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.mapWrapper} onLayout={onMapWrapperLayout}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.mapTransformContainer, animatedContainerStyle]}>
            <View
              style={{ width: imgSize.width, height: imgSize.height }}
              onStartShouldSetResponder={() => isAddingMode}
              onResponderRelease={handleMapPress}
            >
              {backgroundImage && (
                <Image
                  source={{ uri: getPhotoUrl(backgroundImage) ?? undefined }}
                  style={{ width: imgSize.width, height: imgSize.height }}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              )}
              {isAdmin
                ? safeTables.map(table => <TableItem key={table.id} table={table} draggable />)
                : safeTables.map(table => <TableItem key={table.id} table={table} />)}
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      {!isAdmin && (
        <>
          {draft.isActive ? (
            <View style={styles.orderButtonContainer}>
              <TouchableOpacity style={styles.orderButton} onPress={handleContinueOrder}>
                <Ionicons name="cart-outline" size={24} color="#fff" />
                <Text style={styles.orderButtonText}>Продолжить заказ</Text>
              </TouchableOpacity>
            </View>
          ) : (
            selectedTableIds.length > 0 && (
              <View style={styles.orderButtonContainer}>
                <TouchableOpacity style={styles.orderButton} onPress={handleCreateOrderPress}>
                  <Ionicons name="receipt-outline" size={24} color="#fff" />
                  <Text style={styles.orderButtonText}>
                    Создать заказ ({selectedTableIds.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </>
      )}

      {isAddingMode && (
        <View style={styles.helperTextContainer}>
          <Text style={styles.helperText}>Нажмите на карту, чтобы добавить стол</Text>
        </View>
      )}

      <Modal visible={orderModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Заказ #{selectedOrder?.id}</Text>
              <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {loadingOrder ? (
              <ActivityIndicator size="large" style={{ margin: 20 }} />
            ) : selectedOrder ? (
              <ScrollView>
                <View style={styles.orderDetails}>
                  <Text style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Статус: </Text>
                    {getOrderStatusText(selectedOrder.status)}
                  </Text>
                  <Text style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Официант: </Text>
                    {selectedOrder.waiter_name}
                  </Text>
                  <Text style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Столы: </Text>
                    {selectedOrder.table_numbers.join(', ')}
                  </Text>
                </View>
                <Text style={styles.platesTitle}>Блюда:</Text>
                {selectedOrder.plates.map((plate, idx) => (
                  <View key={idx} style={styles.plateItem}>
                    <View style={styles.plateInfo}>
                      <Text style={styles.plateName}>{plate.plate_name}</Text>
                      {plate.comment && (
                        <Text style={styles.plateComment}>Комм: {plate.comment}</Text>
                      )}
                    </View>
                    <Text style={styles.platePrice}>
                      {plate.count} x {plate.price} ₽
                    </Text>
                    <Text style={styles.plateStatus}>
                      {getCookingStatusText(plate.current_status)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
};

export default HallMap;