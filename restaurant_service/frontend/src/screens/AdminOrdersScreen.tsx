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
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

interface PlateInOrder {
  id: number;
  plate_id: number;
  count: number;
  comment: string | null;
  cooking_status: string;
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
  const { authToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/orders/`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) throw new Error('Ошибка загрузки заказов');
      const data: Order[] = await response.json();
      data.sort((a, b) => new Date(b.timestart).getTime() - new Date(a.timestart).getTime());
      setOrders(data);
    } catch (error) {
      console.error(error);
      Alert.alert('Ошибка', 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken]);

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

  const getCookingStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return 'Ожидает';
      case 'preparing': return 'Готовится';
      case 'ready': return 'Готово';
      case 'served': return 'Подано';
      default: return status;
    }
  };

  const getCookingStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return '#f39c12';
      case 'preparing': return '#3498db';
      case 'ready': return '#2ecc71';
      case 'served': return '#95a5a6';
      default: return '#7f8c8d';
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => (
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
            Позиций: {item.plates.reduce((sum, p) => sum + p.count, 0)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="cash-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            Сумма: {item.plates.reduce((sum, p) => sum + p.price * p.count, 0).toFixed(2)} ₽
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderPlateItem = (plate: PlateInOrder) => (
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
      <View style={[styles.cookingStatusBadge, { backgroundColor: getCookingStatusColor(plate.cooking_status) }]}>
        <Text style={styles.cookingStatusText}>{getCookingStatusText(plate.cooking_status)}</Text>
      </View>
    </View>
  );

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
                {selectedOrder.plates.map(plate => (
                  <View key={plate.id}>
                    {renderPlateItem(plate)}
                  </View>
                ))}
                <View style={styles.totalContainer}>
                  <Text style={styles.totalText}>Итого:</Text>
                  <Text style={styles.totalValue}>
                    {selectedOrder.plates.reduce((sum, p) => sum + p.price * p.count, 0).toFixed(2)} ₽
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  listContainer: { padding: 16 },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderId: { fontSize: 18, fontWeight: '600', color: '#333', marginRight: 10 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  orderTime: { fontSize: 14, color: '#666' },
  orderInfo: { gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 14, color: '#333' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalBody: { padding: 20 },
  orderDetails: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: { width: 120, fontSize: 14, color: '#666' },
  detailValue: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },
  platesTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#333' },
  plateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  plateInfo: { flex: 1, marginRight: 10 },
  plateName: { fontSize: 16, fontWeight: '500', color: '#333', marginBottom: 4 },
  plateComment: { fontSize: 13, color: '#888', marginBottom: 4, fontStyle: 'italic' },
  platePrice: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  cookingStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cookingStatusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  totalText: { fontSize: 18, fontWeight: '600', color: '#333' },
  totalValue: { fontSize: 20, fontWeight: 'bold', color: '#007AFF' },
});

export default AdminOrders;