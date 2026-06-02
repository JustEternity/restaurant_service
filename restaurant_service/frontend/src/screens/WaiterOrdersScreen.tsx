import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Modal, ScrollView,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import api from '../services/api';
import styles from '../design/WaiterOrdersStyles';

interface PlateInOrder {
  id: number;
  plate_id: number;
  count: number;
  comment: string | null;
  current_status: string | null;
  price: number;
  plate_name: string;
  course_number: number;
  is_selfserve: boolean;
  is_considered: boolean;
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

const WaiterOrders = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activatingCourse, setActivatingCourse] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  const [footerHeight, setFooterHeight] = useState(0);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/orders/?waiter_id=${user?.id}`);
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
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  const handleRefresh = () => { setRefreshing(true); loadOrders(); };

  const openOrderDetails = (order: Order) => { setSelectedOrder(order); setModalVisible(true); };

  const refreshSelectedOrder = async () => {
    if (!selectedOrder) return;
    try {
      const res = await api.get(`/orders/?waiter_id=${user?.id}`);
      const updatedOrders: Order[] = res.data;
      const updated = updatedOrders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    } catch (error) { console.error('Ошибка обновления заказа', error); }
  };

  const handleEditOrder = () => {
    if (!selectedOrder) return;
    setModalVisible(false);
    navigation.navigate('Меню', {
      screen: 'MenuList',
      params: {
        orderId: selectedOrder.id,
        existingPlates: selectedOrder.plates.map(p => ({
          plate_id: p.plate_id,
          count: p.count,
          comment: p.comment,
          price: p.price,
          current_status: p.current_status,
          id: p.id,
          course_number: p.course_number,
          is_considered: p.is_considered,
        })),
      },
    });
  };

  const completeOrder = async () => {
    if (!selectedOrder) return;
    try {
      await api.put(`/orders/${selectedOrder.id}/complete`);
      setModalVisible(false);
      loadOrders();
      Alert.alert('Заказ завершён', `Заказ #${selectedOrder.id} закрыт`);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось завершить заказ');
    }
  };

  const markAsServed = async (plateId: number) => {
    try {
      await api.put(`/orders/plate/${plateId}/status/served?change_by=${user?.id}`);
      await loadOrders();
      await refreshSelectedOrder();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить статус блюда');
    }
  };

  const toggleConsiderPlate = async (plateId: number, currentConsider: boolean) => {
    const newConsider = !currentConsider;
    try {
      await api.put(`/orders/plate/${plateId}/consider?is_considered=${newConsider}`);
      swipeableRefs.current.get(plateId)?.close();
      await loadOrders();
      await refreshSelectedOrder();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось изменить учёт блюда');
    }
  };

  const handleActivateNextCourse = async () => {
    if (!selectedOrder) return;
    setActivatingCourse(true);
    try {
      const res = await api.post(`/orders/${selectedOrder.id}/activate-next-course`);
      await loadOrders();
      await refreshSelectedOrder();
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Не удалось активировать следующий курс';
      Alert.alert('Ошибка', detail);
    } finally {
      setActivatingCourse(false);
    }
  };

  const cancelOrder = () => {
    if (!selectedOrder) return;
    Alert.alert(
      'Отменить заказ',
      `Вы уверены, что хотите отменить заказ #${selectedOrder.id}?`,
      [
        { text: 'Нет', style: 'cancel' },
        { text: 'Отменить', style: 'destructive', onPress: executeCancel },
      ]
    );
  };

  const executeCancel = async () => {
    setCancelling(true);
    try {
      await api.delete(`/orders/${selectedOrder!.id}`);
      setModalVisible(false);
      await loadOrders();
      Alert.alert('Заказ отменён', `Заказ #${selectedOrder!.id} отменён`);
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось отменить заказ');
    } finally {
      setCancelling(false);
    }
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
      default: return status || 'Не отправлено';
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

  const hasInactiveCourses = (order: Order) => {
    const consideredPlates = order.plates.filter(p => !p.is_selfserve && p.is_considered);
    if (consideredPlates.length === 0) return false;
    const courseNumbers = Array.from(new Set(consideredPlates.map(p => p.course_number)));
    for (const course of courseNumbers) {
      const platesInCourse = consideredPlates.filter(p => p.course_number === course);
      const allInactive = platesInCourse.every(p => p.current_status === null);
      if (allInactive) return true;
    }
    return false;
  };

  const groupPlatesByCourse = (plates: PlateInOrder[]) => {
    const map = new Map<number, PlateInOrder[]>();
    plates.forEach(p => {
      const arr = map.get(p.course_number) || [];
      arr.push(p);
      map.set(p.course_number, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const consideredPlates = item.plates.filter(p => p.is_considered);
    const hasReady = consideredPlates.some(p => p.current_status === 'ready');
    const renderRightActions = () => {
      if (item.status === "completed" || item.status === "cancelled") {
        return (
          <View
            style={{
              width: 80,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <RectButton
              style={[
                styles.swipeButton,
                {
                  backgroundColor: "#2ecc71",
                  marginBottom: 15,
                },
              ]}
              onPress={() => reactivateOrder(item.id) }
            >
              <Ionicons name="refresh" size={24} color="#fff" />
            </RectButton>
          </View>
        );
      }
      return null;
    };
    return (
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[styles.orderCard, hasReady && styles.readyOrderCard]}
          onPress={() => openOrderDetails(item)} activeOpacity={0.7}
        >
          <View style={styles.orderHeader}>
            <View style={styles.orderIdContainer}>
              <Text style={styles.orderId}>Заказ #{item.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: hasReady ? '#e91e8c' : getStatusColor(item.status) }]}>
                <Text style={styles.statusText}>{hasReady ? 'Готово подать' : getStatusText(item.status)}</Text>
              </View>
            </View>
            <Text style={styles.orderTime}>
              {new Date(item.timestart).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.orderInfo}>
            <View style={styles.infoRow}>
              <Ionicons name="restaurant-outline" size={16} color="#666" />
              <Text style={styles.infoText}>Столы: {item.table_numbers.join(', ')}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="receipt-outline" size={16} color="#666" />
              <Text style={styles.infoText}>Позиций: {consideredPlates.reduce((sum, p) => sum + p.count, 0)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="cash-outline" size={16} color="#666" />
              <Text style={styles.infoText}>Сумма: {consideredPlates.reduce((sum, p) => sum + p.price * p.count, 0).toFixed(2)} ₽</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderPlateItem = (plate: PlateInOrder) => {
    const renderRightActions = () => {
      return (
        <RectButton
          style={[
            styles.swipeButton,
            { backgroundColor: plate.is_considered ? '#e67e22' : '#2ecc71' }
          ]}
          onPress={() => toggleConsiderPlate(plate.id, plate.is_considered)}
        >
          <Ionicons
            name={plate.is_considered ? 'remove-circle-outline' : 'add-circle-outline'}
            size={24}
            color="#fff"
          />
        </RectButton>
      );
    };

    return (
      <Swipeable
        key={plate.id}
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(plate.id, ref);
        }}
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        <View style={[styles.plateItem, !plate.is_considered && { opacity: 0.5 }]}>
          <View style={styles.plateInfo}>
            <Text style={styles.plateName}>
              {plate.plate_name}
              {plate.is_selfserve ? ' ✋🏻' : ''}
              {!plate.is_considered && ''}
            </Text>
            {plate.comment && <Text style={styles.plateComment}>Комментарий: {plate.comment}</Text>}
            <Text style={styles.platePrice}>{plate.count} x {plate.price} ₽ = {(plate.count * plate.price).toFixed(2)} ₽</Text>
          </View>
          <View style={styles.plateStatusContainer}>
            {(!plate.is_selfserve || plate.current_status) && (
              <View style={[styles.cookingStatusBadge, { backgroundColor: getCookingStatusColor(plate.current_status || 'waiting') }]}>
                <Text style={styles.cookingStatusText}>
                  {plate.current_status ? getCookingStatusText(plate.current_status) : 'Не отправлено'}
                </Text>
              </View>
            )}
            {(plate.current_status === 'ready' || (plate.is_selfserve && plate.current_status !== 'served')) && plate.is_considered && (
              <TouchableOpacity style={styles.servedButton} onPress={() => markAsServed(plate.id)}>
                <Text style={styles.servedButtonText}>Подано</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Swipeable>
    );
  };

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (data.type === 'plate_ready' || data.type === 'plate_status_changed') {
        loadOrders();
      }
    });
    return unsubscribe;
  }, [loadOrders]);

  const allServed = selectedOrder?.plates.filter(p => p.is_considered).every(p => p.current_status === 'served');

  const reactivateOrder = async (orderId: number) => {
    try {
      await api.put(`/orders/${orderId}/reactivate`);
      await loadOrders();
    } catch (error: any) {
      Alert.alert("Ошибка", error.response?.data?.detail || "Не удалось активировать заказ");
    }
  };

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
        <Text style={styles.headerTitle}>Мои заказы</Text>
        <Text style={styles.headerSubtitle}>{orders.length} заказов</Text>
      </View>
      <FlatList
        data={orders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>У вас пока нет заказов</Text>
          </View>
        }
      />
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Заказ #{selectedOrder?.id}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={{
                  paddingBottom: footerHeight,
                }}
              >
                {selectedOrder && (
                  <>
                    <View style={styles.orderDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Столы:</Text>
                        <Text style={styles.detailValue}>
                          {selectedOrder.table_numbers.join(', ')}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Время создания:</Text>
                        <Text style={styles.detailValue}>
                          {new Date(selectedOrder.timestart).toLocaleString('ru-RU')}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Статус:</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: getStatusColor(selectedOrder.status) }
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {getStatusText(selectedOrder.status)}
                          </Text>
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

                    {groupPlatesByCourse(selectedOrder.plates).map(
                      ([courseNumber, plates]) => (
                        <View key={courseNumber} style={{ marginBottom: 10 }}>
                          <Text style={styles.courseTitle}>Курс {courseNumber}</Text>
                          {plates.map((plate) => (
                            <View key={plate.id}>{renderPlateItem(plate)}</View>
                          ))}
                        </View>
                      )
                    )}
                  </>
                )}
              </ScrollView>

              <View
                style={styles.fixedFooter}
                onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
              >
                <View style={styles.totalContainer}>
                  <Text style={styles.totalText}>Итого:</Text>
                  <Text style={styles.totalValue}>
                    {selectedOrder?.plates
                      .filter((p) => p.is_considered)
                      .reduce((sum, p) => sum + p.price * p.count, 0)
                      .toFixed(2)} ₽
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  {selectedOrder?.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.cancelOrderButton, { flex: 1 }]}
                      onPress={cancelOrder}
                      disabled={cancelling}
                    >
                      {cancelling ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.editOrderButtonText}>Отменить</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {selectedOrder?.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.editOrderButton, { flex: 1 }]}
                      onPress={handleEditOrder}
                    >
                      <Text style={styles.editOrderButtonText}>Редактировать</Text>
                    </TouchableOpacity>
                  )}

                  {selectedOrder?.status === 'active' &&
                    hasInactiveCourses(selectedOrder) && (
                      <TouchableOpacity
                        style={[styles.activateCourseButton, { flex: 1 }]}
                        onPress={handleActivateNextCourse}
                        disabled={activatingCourse}
                      >
                        {activatingCourse ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.editOrderButtonText}>Следующий курс</Text>
                        )}
                      </TouchableOpacity>
                    )}

                  {allServed && selectedOrder?.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.completeOrderButton, { flex: 1 }]}
                      onPress={completeOrder}
                    >
                      <Text style={styles.editOrderButtonText}>Завершить заказ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>

    </View>
  );
};

export default WaiterOrders;