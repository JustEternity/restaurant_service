import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import api from '../services/api';
import styles from '../design/AdminOrdersStyles';

interface PlateInOrder {
  id: number;
  plate_id: number;
  count: number;
  comment: string | null;
  cooking_status?: string | null;
  current_status?: string | null;
  price: number;
  plate_name: string;
}

interface Order {
  id: number;
  waiter: number;
  status: string;
  timestart: string;
  endtime: string | null;
  waiter_name: string;
  table_numbers: number[];
  plates: PlateInOrder[];
}

const AdminOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/orders/');
      const data: Order[] = response.data;
      const statusPriority: Record<string, number> = {
        active: 1,
        completed: 2,
        cancelled: 3,
      };
      data.sort((a, b) => {
        const statusDiff = statusPriority[a.status] - statusPriority[b.status];
        if (statusDiff !== 0) return statusDiff;

        return new Date(b.timestart).getTime() - new Date(a.timestart).getTime();
      });
      setOrders(data);
    } catch (error) {
      console.error(error);
      Alert.alert('Ошибка', 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#2ecc71';
      case 'completed': return '#95a5a6';
      case 'cancelled': return '#e74c3c';
      default: return '#3498db';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Активен';
      case 'completed': return 'Завершён';
      case 'cancelled': return 'Отменён';
      default: return status;
    }
  };

  const getCookingStatusText = (status: string | null | undefined) => {
    switch (status) {
      case 'waiting': return 'Ожидает';
      case 'preparing': return 'Готовится';
      case 'ready': return 'Готово';
      case 'served': return 'Подано';
      case 'cancelled': return 'Отменено кухней';
      default: return 'Не отправлено';
    }
  };

  const getCookingStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return '#f39c12';
      case 'preparing': return '#3498db';
      case 'ready': return '#2ecc71';
      case 'served': return '#95a5a6';
      case 'cancelled': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const activePlates = item.plates.filter(
      p => (p.cooking_status ?? p.current_status) !== 'cancelled'
    );
    return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => openOrderDetails(item)}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderIdContainer}>
          <Text style={styles.orderId}>Заказ #{item.id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>
        <Text style={styles.orderTime}>
          {new Date(item.timestart).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <View style={styles.orderInfo}>
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={16} color="#666" />
          <Text style={styles.infoText}>Официант: {item.waiter_name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="restaurant-outline" size={16} color="#666" />
          <Text style={styles.infoText}>Столы: {item.table_numbers.join(', ')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="receipt-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            Позиций: {activePlates.reduce((sum, p) => sum + p.count, 0)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="cash-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            Сумма: {activePlates.reduce((sum, p) => sum + p.price * p.count, 0).toFixed(2)} ₽
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )};

  const groupPlatesByCourse = (plates: PlateInOrder[]) => {
    const map = new Map<number, PlateInOrder[]>();

    plates.forEach(p => {
      const course = (p as any).course_number ?? 1;
      const arr = map.get(course) || [];
      arr.push(p);
      map.set(course, arr);
    });

    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  };


const renderPlateItem = (plate: PlateInOrder) => {
    const cookingStatus = plate.cooking_status ?? plate.current_status ?? 'waiting';

    return (
      <View style={styles.plateItem}>
        <View style={styles.plateInfo}>
          <Text style={styles.plateName}>{plate.plate_name}</Text>
          {plate.comment && (
            <Text style={styles.plateComment}>Комментарий: {plate.comment}</Text>
          )}
          <Text style={styles.platePrice}>
            {plate.count} x {plate.price} ₽ = {(plate.count * plate.price).toFixed(2)} ₽
          </Text>
        </View>
        <View style={[styles.cookingStatusBadge, { backgroundColor: getCookingStatusColor(cookingStatus) }]}>
          <Text style={styles.cookingStatusText}>{getCookingStatusText(cookingStatus)}</Text>
        </View>
      </View>
    );
  };

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (
        data.type === 'plate_ready' ||
        data.type === 'plate_status_changed' ||
        data.type === 'order_completed' ||
        data.type === 'order_created' ||
        data.type === 'order_updated' ||
        data.type === 'plate_cancelled'
      ) {
        loadOrders();
      }
    });
    return unsubscribe;
  }, [addHandler, loadOrders]);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка заказов...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>{orders.length} заказов</Text>
      </View>

      <FlatList
        data={orders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Нет заказов в системе</Text>
          </View>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Заказ #{selectedOrder?.id}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {selectedOrder && (
              <>
              <ScrollView style={styles.modalBody}>
                <View style={styles.orderDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Официант:</Text>
                    <Text style={styles.detailValue}>{selectedOrder.waiter_name}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Столы:</Text>
                    <Text style={styles.detailValue}>{selectedOrder.table_numbers.join(', ')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Время создания:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedOrder.timestart).toLocaleString('ru-RU')}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Статус:</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedOrder.status) }]}>
                      <Text style={styles.statusText}>{getStatusText(selectedOrder.status)}</Text>
                    </View>
                  </View>
                  {selectedOrder.endtime && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Время завершения:</Text>
                      <Text style={styles.detailValue}>
                        {new Date(selectedOrder.endtime).toLocaleString('ru-RU')}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.platesTitle}>Блюда в заказе:</Text>
                {groupPlatesByCourse(selectedOrder.plates).map(([courseNumber, plates]) => (
                  <View key={courseNumber} style={{ marginBottom: 12 }}>
                    <Text style={styles.courseTitle}>Курс {courseNumber}</Text>

                    {plates.map(plate => (
                      <View key={plate.id}>
                        {renderPlateItem(plate)}
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
               <View style={styles.totalContainer}>
                  <Text style={styles.totalText}>Итого:</Text>
                  <Text style={styles.totalValue}>
                    {selectedOrder.plates
                      .filter(p => (p.cooking_status ?? p.current_status) !== 'cancelled')
                      .reduce((sum, p) => sum + p.price * p.count, 0)
                      .toFixed(2)} ₽
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default AdminOrders;