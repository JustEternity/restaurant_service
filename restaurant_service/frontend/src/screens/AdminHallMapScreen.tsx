import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
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
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface Table {
  id: number;
  number: number;
  pos_x: number;
  pos_y: number;
  status: string;
  is_available: boolean;
}

type RootStackParamList = {
  WaiterMenu: { selectedTableIds: number[] };
};

const HallMap = () => {
  const { authToken, user } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const isAdmin = user?.role === 'admin';

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddingMode, setIsAddingMode] = useState(false);

  const safeSetTables = (updater: Table[] | ((prev: Table[]) => Table[])) => {
    setTables((prev: Table[]) => {
      const current = Array.isArray(prev) ? prev : [];
      const newState = typeof updater === 'function' ? updater(current) : updater;
      return Array.isArray(newState) ? newState : [];
    });
  };

  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/tables/`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error('Ошибка загрузки столов');
      const data = await response.json();
      safeSetTables(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить столы');
      safeSetTables([]);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const updateTablePosition = async (id: number, pos_x: number, pos_y: number) => {
    if (!isAdmin) return;
    try {
      await fetch(`${API_CONFIG.BASE_URL}/tables/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pos_x, pos_y }),
      });
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
      const response = await fetch(`${API_CONFIG.BASE_URL}/tables/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: newNumber,
          pos_x: x,
          pos_y: y,
          status: 'free',
          is_available: true,
        }),
      });
      if (!response.ok) throw new Error('Ошибка создания стола');
      const newTable: Table = await response.json();
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
            await fetch(`${API_CONFIG.BASE_URL}/tables/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${authToken}` },
            });
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

  const toggleTableSelection = (id: number) => {
    setSelectedTableIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedTableIds([]);
  };

  const handleCreateOrderPress = () => {
    if (selectedTableIds.length === 0) return;
    if (isAdmin) {
      const numbers = tables
        .filter((t) => selectedTableIds.includes(t.id))
        .map((t) => t.number)
        .join(', ');
      Alert.alert('Создать заказ', `Для столов: ${numbers}`);
    } else {
      navigation.navigate('Меню', {
        screen: 'MenuList',
        params: { selectedTableIds },
      });
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
            onPress={() => toggleTableSelection(table.id)}
            onLongPress={() => deleteTable(table.id)}
          >
            <View
              style={[
                styles.table,
                table.status === 'occupied' && styles.tableOccupied,
                selectedTableIds.includes(table.id) && styles.tableSelected,
              ]}
            >
              <Text style={styles.tableNumber}>{table.number}</Text>
              <Text style={styles.tableStatus}>
                {table.status === 'free' ? 'Свободен' : 'Занят'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    );
  };

  const renderTable = (table: Table) => {
    if (isAdmin) {
      return <DraggableTable key={table.id} table={table} />;
    } else {
      return (
        <TouchableOpacity
          key={table.id}
          style={[styles.tableContainer, { left: table.pos_x, top: table.pos_y }]}
          activeOpacity={0.8}
          onPress={() => toggleTableSelection(table.id)}
        >
          <View
            style={[
              styles.table,
              table.status === 'occupied' && styles.tableOccupied,
              selectedTableIds.includes(table.id) && styles.tableSelected,
            ]}
          >
            <Text style={styles.tableNumber}>{table.number}</Text>
            <Text style={styles.tableStatus}>
              {table.status === 'free' ? 'Свободен' : 'Занят'}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
  };

  if (loading) {
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
          {selectedTableIds.length > 0 && (
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
                <TouchableOpacity
                  style={[styles.addButton, isAddingMode && styles.addButtonActive]}
                  onPress={() => setIsAddingMode(!isAddingMode)}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={1}
        style={styles.mapContainer}
        onPress={handleMapPress}
        disabled={!isAdmin || !isAddingMode}
      >
        {safeTables.map((table) => renderTable(table))}
      </TouchableOpacity>

      {selectedTableIds.length > 0 && (
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
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  clearButton: { marginRight: 12, padding: 4 },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  editButtonActive: { backgroundColor: '#007AFF' },
  addButton: {
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  addButtonActive: { backgroundColor: '#34c759' },
  mapContainer: { flex: 1, backgroundColor: '#e9ecef', position: 'relative' },
  tableContainer: { position: 'absolute', left: 0, top: 0 },
  table: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4cd964',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  tableOccupied: { backgroundColor: '#ff9500' },
  tableSelected: { borderWidth: 4, borderColor: '#007AFF' },
  tableNumber: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  tableStatus: { fontSize: 10, color: '#fff', marginTop: 4 },
  orderButtonContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  orderButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  orderButtonText: { color: '#fff', fontSize: 18, fontWeight: '600', marginLeft: 8 },
  helperTextContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  helperText: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 14,
  },
});

export default HallMap;