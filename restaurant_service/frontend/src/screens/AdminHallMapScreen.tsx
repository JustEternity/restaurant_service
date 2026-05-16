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
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../context/AuthContext';
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
  WaiterMenu: { selectedTableIds: number[] };
};

const HallMap = () => {
  const { user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const isAdmin = user?.role === 'admin';

  const [tables, setTables] = useState<Table[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
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

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/hallmap/settings');
      if (res.data.hallmap_image) {
        setBackgroundImage(res.data.hallmap_image);
      }
      const size = Number(res.data.table_size) || 30;
      setTableSize(size);
      setTempTableSize(String(size));
    } catch (error) {
      console.error('Ошибка загрузки настроек схемы', error);
    }
  }, []);

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
        if (hasReady) {
          order.table_numbers.forEach(num => readyNumbers.add(num));
        }
      });
      const ids = new Set<number>();
      currentTables.forEach(table => {
        if (readyNumbers.has(table.number)) {
          ids.add(table.id);
        }
      });
      setReadyTableIds(ids);
    } catch (error) {
      console.error('Ошибка загрузки готовых заказов', error);
    }
  }, [user, isAdmin]);

  const manualRefresh = useCallback(async () => {
    const newTables = await loadTables();
    await loadReadyTables(newTables);
  }, [loadTables, loadReadyTables]);

  useEffect(() => {
    manualRefresh();
    loadSettings();
  }, []);

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (
        data.type === 'plate_ready' ||
        data.type === 'plate_status_changed' ||
        data.type === 'order_completed' ||
        data.type === 'order_created' ||
        data.type === 'order_updated'
      ) {
        manualRefresh();
      }
    });
    return unsubscribe;
  }, [addHandler, manualRefresh]);

  const updateTablePosition = async (id: number, pos_x: number, pos_y: number) => {
    if (!isAdmin) return;
    try {
      await api.put(`/tables/${id}`, { pos_x, pos_y });
    } catch (error) {
      console.error('Ошибка сохранения позиции стола:', error);
    }
  };

  const handleDragEnd = (tableId: number, newX: number, newY: number) => {
    if (!isAdmin) return;
    updateTablePosition(tableId, newX, newY);
    safeSetTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, pos_x: newX, pos_y: newY } : t))
    );
  };

  const createTable = async (x: number, y: number) => {
    if (!isAdmin) return;
    try {
      const newNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
      const response = await api.post('/tables/', {
        number: newNumber,
        pos_x: x,
        pos_y: y,
        status: 'free',
        is_available: true,
      });
      const newTable: Table = response.data;
      if (newTable && newTable.id) {
        safeSetTables((prev) => [...prev, newTable]);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать стол');
    }
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
            safeSetTables((prev) => prev.filter((t) => t.id !== id));
            setSelectedTableIds((prev) => prev.filter((tid) => tid !== id));
          } catch (error) {
            Alert.alert('Ошибка', 'Не удалось удалить стол');
          }
        },
      },
    ]);
  };

  const handleMapPress = (event: any) => {
    if (!isAdmin || !isAddingMode) return;
    const { locationX, locationY } = event.nativeEvent;
    createTable(locationX, locationY);
    setIsAddingMode(false);
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
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить заказ');
    } finally {
      setLoadingOrder(false);
    }
  };

  const toggleTableSelection = (table: Table) => {
    if (table.status === 'occupied' || readyTableIds.has(table.id)) {
      showOrderForTable(table);
      return;
    }
    if (!isAdmin) {
      setSelectedTableIds((prev) =>
        prev.includes(table.id) ? prev.filter((tid) => tid !== table.id) : [...prev, table.id]
      );
    }
  };

  const clearSelection = () => {
    setSelectedTableIds([]);
  };

  const handleCreateOrderPress = () => {
    if (selectedTableIds.length === 0) return;
    if (!isAdmin) {
      navigation.navigate('Меню', {
        screen: 'MenuList',
        params: { selectedTableIds },
      });
    }
  };

  const saveTableSize = async () => {
    const size = parseFloat(tempTableSize) || 30;
    setSavingSize(true);
    try {
      await api.put('/hallmap/settings', { table_size: size });
      setTableSize(size);
      Alert.alert('Готово', 'Размер столов обновлён');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить размер');
    } finally {
      setSavingSize(false);
    }
  };

  const pickBackground = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нужен доступ к фото');
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

    const formData = new FormData();
    formData.append('file', {
      uri: manipResult.uri,
      name: 'floorplan.jpg',
      type: 'image/jpeg',
    } as any);

    setUploadingBg(true);
    try {
      const res = await api.post('/hallmap/upload-background', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBackgroundImage(res.data.url);
      Alert.alert('Готово', 'Фон схемы обновлён');
    } catch (error: any) {
      Alert.alert('Ошибка', error.message);
    } finally {
      setUploadingBg(false);
    }
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

  const DraggableTable = ({ table }: { table: Table }) => {
    const translateX = useSharedValue(table.pos_x);
    const translateY = useSharedValue(table.pos_y);
    const context = useSharedValue({ x: 0, y: 0 });

    const panGesture = Gesture.Pan()
      .enabled(isEditMode)
      .onStart(() => {
        context.value = { x: translateX.value, y: translateY.value };
      })
      .onUpdate((event) => {
        translateX.value = context.value.x + event.translationX;
        translateY.value = context.value.y + event.translationY;
      })
      .onEnd(() => {
        runOnJS(handleDragEnd)(table.id, translateX.value, translateY.value);
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    }));

    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.tableContainer, animatedStyle]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => toggleTableSelection(table)}
            onLongPress={() => deleteTable(table)}
          >
            <View
              style={[
                styles.table,
                table.status === 'occupied' && !readyTableIds.has(table.id) && styles.tableOccupied,
                readyTableIds.has(table.id) && styles.tableReady,
                selectedTableIds.includes(table.id) && !isAdmin && styles.tableSelected,
                {
                  width: tableSize * 2,
                  height: tableSize * 2,
                  borderRadius: tableSize,
                },
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

  const renderStaticTable = (table: Table) => (
    <TouchableOpacity
      key={table.id}
      style={[styles.tableContainer, { left: table.pos_x, top: table.pos_y }]}
      activeOpacity={0.8}
      onPress={() => toggleTableSelection(table)}
    >
      <View
        style={[
          styles.table,
          table.status === 'occupied' && !readyTableIds.has(table.id) && styles.tableOccupied,
          readyTableIds.has(table.id) && styles.tableReady,
          selectedTableIds.includes(table.id) && !isAdmin && styles.tableSelected,
          {
            width: tableSize * 2,
            height: tableSize * 2,
            borderRadius: tableSize,
          },
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
  );

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Загрузка схемы зала...</Text>
      </View>
    );
  }

  const safeTables = Array.isArray(tables) ? tables : [];

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

      <TouchableOpacity
        activeOpacity={1}
        style={styles.mapContainer}
        onPress={handleMapPress}
        disabled={!isAdmin || !isAddingMode}
      >
        {backgroundImage && (
          <Image
            source={{ uri: getPhotoUrl(backgroundImage) ?? undefined }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />
        )}
        {isAdmin
          ? safeTables.map((table) => <DraggableTable key={table.id} table={table} />)
          : safeTables.map((table) => renderStaticTable(table))}
      </TouchableOpacity>

      {selectedTableIds.length > 0 && !isAdmin && (
        <View style={styles.orderButtonContainer}>
          <TouchableOpacity style={styles.orderButton} onPress={handleCreateOrderPress}>
            <Ionicons name="receipt-outline" size={24} color="#fff" />
            <Text style={styles.orderButtonText}>
              Создать заказ ({selectedTableIds.length})
            </Text>
          </TouchableOpacity>
        </View>
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