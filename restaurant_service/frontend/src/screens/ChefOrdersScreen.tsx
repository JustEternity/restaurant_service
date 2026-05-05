import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useWebSocket } from '../hooks/useWebSocket';

interface Specialization {
  id: number;
  name: string;
}

interface PlatesForSpecializationLink {
  id: number;
  plate_id: number;
  plate_name: string;
  specialization_id: number;
  specialization_name: string;
}

interface OrderPlate {
  id: number;
  plate_id: number;
  count: number;
  comment: string | null;
  current_status: string;
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
  plates: OrderPlate[];
}

interface FlatOrderedPlate {
  uid: string;
  plate_name: string;
  count: number;
  comments: string[];
  current_status: string;
  order_id: number;
  plate_order_id: number;
  table_numbers: number[];
  timestart: string;
  plate_id: number;
}

interface Cook {
  id: number;
  name: string;
  specialization?: Specialization;
}

type StatusFilter = 'waiting' | 'preparing' | 'ready';
type SpecializationFilter = 'all' | number;

const ChefOrders = () => {
  const { authToken, user } = useAuth();
  const [items, setItems] = useState<FlatOrderedPlate[]>([]);
  const [filteredItems, setFilteredItems] = useState<FlatOrderedPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FlatOrderedPlate | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('waiting');
  const [specializationFilter, setSpecializationFilter] = useState<SpecializationFilter>('all');
  const [availableSpecializations, setAvailableSpecializations] = useState<Specialization[]>([]);

  const [changeStatusModalVisible, setChangeStatusModalVisible] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [groupCooks, setGroupCooks] = useState<Cook[]>([]);
  const [selectedCookId, setSelectedCookId] = useState<number | null>(null);

  const plateToSpecializations = useRef<Map<number, Set<number>>>(new Map());

  const loadAllowedPlateIds = useCallback(async (): Promise<Set<number>> => {
    const specializationIds = new Set<number>();
    const specializationsMap = new Map<number, Specialization>();
    try {
      const userRes = await fetch(`${API_CONFIG.BASE_URL}/users/${user?.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!userRes.ok) throw new Error('Ошибка загрузки пользователя');
      const currentUser = await userRes.json();

      if (currentUser.specialization?.id) {
        specializationIds.add(currentUser.specialization.id);
        specializationsMap.set(currentUser.specialization.id, currentUser.specialization);
      }

      if (currentUser.cook_groups && currentUser.cook_groups.length > 0) {
        for (const group of currentUser.cook_groups) {
          const cooksRes = await fetch(`${API_CONFIG.BASE_URL}/cook-groups/${group.id}/cooks/`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (cooksRes.ok) {
            const cooks = await cooksRes.json();
            cooks.forEach((cook: any) => {
              if (cook.specialization?.id) {
                specializationIds.add(cook.specialization.id);
                specializationsMap.set(cook.specialization.id, cook.specialization);
              }
            });
          }
        }
      }

      const allowedPlateIds = new Set<number>();
      const newPlateToSpec = new Map<number, Set<number>>();

      for (const specId of specializationIds) {
        const platesRes = await fetch(`${API_CONFIG.BASE_URL}/plates-specializations/specialization/${specId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (platesRes.ok) {
          const plates: PlatesForSpecializationLink[] = await platesRes.json();
          plates.forEach(link => {
            allowedPlateIds.add(link.plate_id);
            if (!newPlateToSpec.has(link.plate_id)) {
              newPlateToSpec.set(link.plate_id, new Set());
            }
            newPlateToSpec.get(link.plate_id)!.add(specId);
          });
        }
      }

      plateToSpecializations.current = newPlateToSpec;
      setAvailableSpecializations(Array.from(specializationsMap.values()));

      return allowedPlateIds;
    } catch (error) {
      console.error('Ошибка получения разрешённых блюд', error);
      return new Set<number>();
    }
  }, [authToken, user?.id]);

  const loadGroupCooks = useCallback(async () => {
    try {
      const userRes = await fetch(`${API_CONFIG.BASE_URL}/users/${user?.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!userRes.ok) throw new Error('Ошибка загрузки пользователя');
      const currentUser = await userRes.json();
      const cooksMap = new Map<number, Cook>();

      if (currentUser.cook_groups && currentUser.cook_groups.length > 0) {
        for (const group of currentUser.cook_groups) {
          const cooksRes = await fetch(`${API_CONFIG.BASE_URL}/cook-groups/${group.id}/cooks/`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (cooksRes.ok) {
            const cooks = await cooksRes.json();
            cooks.forEach((c: any) => {
              if (!cooksMap.has(c.id)) {
                cooksMap.set(c.id, {
                  id: c.id,
                  name: c.name,
                  specialization: c.specialization,
                });
              }
            });
          }
        }
      }
      setGroupCooks(Array.from(cooksMap.values()));
    } catch (error) {
      console.error('Ошибка загрузки поваров группы', error);
    }
  }, [authToken, user?.id]);

  useEffect(() => {
    loadData();
    loadGroupCooks();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const allowedPlateIds = await loadAllowedPlateIds();
      if (allowedPlateIds.size === 0) {
        setItems([]);
        setFilteredItems([]);
        return;
      }

      const ordersRes = await fetch(`${API_CONFIG.BASE_URL}/orders/?status=active`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!ordersRes.ok) throw new Error('Ошибка загрузки заказов');
      const orders: Order[] = await ordersRes.json();

      const groupedMap = new Map<string, FlatOrderedPlate>();
      for (const order of orders) {
        for (const plate of order.plates) {
          if (!allowedPlateIds.has(plate.plate_id)) continue;
          const key = `${order.id}_${plate.id}`;
          const existing = groupedMap.get(key);
          if (existing) {
            existing.count += plate.count;
            if (plate.comment) existing.comments.push(plate.comment);
          } else {
            groupedMap.set(key, {
              uid: key,
              plate_name: plate.plate_name,
              count: plate.count,
              comments: plate.comment ? [plate.comment] : [],
              current_status: plate.current_status,
              order_id: order.id,
              plate_order_id: plate.id,
              table_numbers: order.table_numbers,
              timestart: order.timestart,
              plate_id: plate.plate_id,
            });
          }
        }
      }

      const flatList = Array.from(groupedMap.values());
      flatList.sort((a, b) => new Date(a.timestart).getTime() - new Date(b.timestart).getTime());
      setItems(flatList);
      applyFilter(flatList, statusFilter, specializationFilter);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAllowedPlateIds, authToken, statusFilter, specializationFilter]);

  const applyFilter = (
    source: FlatOrderedPlate[],
    statusF: StatusFilter,
    specF: SpecializationFilter
  ) => {
    let filtered = source.filter(item => item.current_status === statusF);
    if (specF !== 'all') {
      filtered = filtered.filter(item => {
        const specs = plateToSpecializations.current.get(item.plate_id);
        return specs && specs.has(specF);
      });
    }
    setFilteredItems(filtered);
  };

  useEffect(() => {
    applyFilter(items, statusFilter, specializationFilter);
  }, [statusFilter, specializationFilter, items]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openDetail = (item: FlatOrderedPlate) => {
    setSelectedItem(item);
    setDetailModalVisible(true);
  };

  const getNextStatus = (current: string) => {
    switch (current) {
      case 'waiting': return 'preparing';
      case 'preparing': return 'ready';
      default: return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'preparing': return 'Готовится';
      case 'ready': return 'Готово';
      default: return status;
    }
  };

  const openChangeStatus = (nextStatus: string) => {
    setTargetStatus(nextStatus);
    setSelectedCookId(user?.id ?? null);
    setChangeStatusModalVisible(true);
  };

  const changePlateStatus = async () => {
    if (!selectedItem || !targetStatus || !selectedCookId) return;
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/orders/plate/${selectedItem.plate_order_id}/status/${targetStatus}?change_by=${selectedCookId}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Не удалось изменить статус');
      }
      setChangeStatusModalVisible(false);
      setDetailModalVisible(false);
      loadData();
      Alert.alert('Успех', `Статус изменён на "${getStatusLabel(targetStatus)}"`);
    } catch (error: any) {
      Alert.alert('Ошибка', error.message || 'Не удалось изменить статус');
      setChangeStatusModalVisible(false);
      setDetailModalVisible(false);
      loadData();
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'waiting': return { label: 'Ожидает', color: '#f39c12' };
      case 'preparing': return { label: 'Готовится', color: '#3498db' };
      case 'ready': return { label: 'Готово', color: '#2ecc71' };
      case 'served': return { label: 'Подано', color: '#95a5a6' };
      default: return { label: status, color: '#7f8c8d' };
    }
  };

  const { addHandler } = useWebSocket();
    useEffect(() => {
      const unsubscribe = addHandler((data: any) => {
        console.log('HallMap raw event:', data);
        if (
          data.type === 'new_order'
        ) {
          handleRefresh();
        }
      });
      return unsubscribe;
    }, [addHandler, handleRefresh]);

  const renderItem = ({ item }: { item: FlatOrderedPlate }) => {
    const statusInfo = getStatusInfo(item.current_status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <Text style={styles.plateName}>{item.plate_name}</Text>
          <Text style={styles.count}>x{item.count}</Text>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.orderInfo}>
            Заказ #{item.order_id} • Столы {item.table_numbers.join(', ')}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
            <Text style={styles.statusText}>{statusInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.time}>
          {new Date(item.timestart).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderFilterChip = (
    value: string | number,
    label: string,
    current: string | number,
    onSelect: (value: any) => void,
    activeColor = '#FF6B6B'
  ) => (
    <TouchableOpacity
      style={[
        styles.filterChip,
        current === value && styles.filterChipActive,
        current === value && { backgroundColor: activeColor },
      ]}
      onPress={() => onSelect(value)}
    >
      <Text style={[styles.filterChipText, current === value && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text>Загрузка...</Text>
      </View>
    );
  }

  const nextStatus = selectedItem ? getNextStatus(selectedItem.current_status) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>{filteredItems.length} позиций</Text>
      </View>

      {/* Фильтр по статусу */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {renderFilterChip('waiting', 'Ожидает', statusFilter, setStatusFilter)}
          {renderFilterChip('preparing', 'Готовится', statusFilter, setStatusFilter)}
          {renderFilterChip('ready', 'Готово', statusFilter, setStatusFilter)}
        </ScrollView>
      </View>

      {/* Фильтр по специализации */}
      {availableSpecializations.length > 1 && (
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {renderFilterChip('all', 'Все', specializationFilter, setSpecializationFilter, '#2ecc71')}
            {availableSpecializations.map(spec => (
              <React.Fragment key={spec.id}>
                {renderFilterChip(spec.id, spec.name, specializationFilter, setSpecializationFilter, '#2ecc71')}
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#FF6B6B']} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="flame-outline" size={60} color="#ccc" />
            <Text>Нет заказов</Text>
          </View>
        }
      />

      {/* Детали позиции */}
      <Modal visible={detailModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedItem?.plate_name}</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Заказ:</Text>
                  <Text style={styles.detailValue}>#{selectedItem.order_id}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Столы:</Text>
                  <Text style={styles.detailValue}>{selectedItem.table_numbers.join(', ')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Количество:</Text>
                  <Text style={styles.detailValue}>{selectedItem.count}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Статус:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusInfo(selectedItem.current_status).color }]}>
                    <Text style={styles.statusText}>{getStatusInfo(selectedItem.current_status).label}</Text>
                  </View>
                </View>
                {selectedItem.comments.length > 0 ? (
                  <View style={styles.commentBox}>
                    <Text style={styles.detailLabel}>Комментарии:</Text>
                    {selectedItem.comments.map((c, idx) => (
                      <Text key={idx} style={styles.commentText}>• {c}</Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noComment}>Нет комментариев</Text>
                )}
                <Text style={styles.timeText}>
                  Время заказа: {new Date(selectedItem.timestart).toLocaleString('ru-RU')}
                </Text>

                {/* Кнопка смены статуса */}
                {nextStatus && (
                  <TouchableOpacity
                    style={styles.changeStatusButton}
                    onPress={() => {
                      setDetailModalVisible(false);
                      openChangeStatus(nextStatus);
                    }}
                  >
                    <Text style={styles.changeStatusButtonText}>
                      {nextStatus === 'preparing' ? 'Взять в работу' : 'Завершить приготовление'}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Выбор повара для смены статуса */}
      <Modal visible={changeStatusModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Кто выполняет?</Text>
            <FlatList
              data={groupCooks}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.cookItem,
                    selectedCookId === item.id && styles.cookItemSelected,
                  ]}
                  onPress={() => setSelectedCookId(item.id)}
                >
                  <Text style={styles.cookName}>{item.name}</Text>
                  {item.specialization && (
                    <Text style={styles.cookSpec}>{item.specialization.name}</Text>
                  )}
                  {selectedCookId === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#2ecc71" />
                  )}
                </TouchableOpacity>
              )}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setChangeStatusModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={changePlateStatus}
                disabled={!selectedCookId}
              >
                <Text style={styles.confirmButtonText}>Подтвердить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 8, backgroundColor: '#FF6B6B' },
  subtitle: { fontSize: 14, color: '#fff', marginTop: 4 },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#FF6B6B' },
  filterChipText: { fontSize: 14, color: '#666' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  listContent: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  plateName: { fontSize: 16, fontWeight: '600', flex: 1 },
  count: { fontSize: 16, fontWeight: 'bold', color: '#FF6B6B' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderInfo: { fontSize: 14, color: '#666', flex: 1 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  time: { fontSize: 12, color: '#999', marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 100 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  modalBody: {},
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailLabel: { width: 80, fontSize: 14, color: '#666' },
  detailValue: { fontSize: 14, color: '#333', fontWeight: '500' },
  commentBox: { marginTop: 12, marginBottom: 12 },
  commentText: { fontSize: 14, color: '#333', fontStyle: 'italic', marginTop: 4 },
  noComment: { marginTop: 12, color: '#999', fontStyle: 'italic' },
  timeText: { marginTop: 12, color: '#999', fontSize: 12 },
  changeStatusButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    padding: 14,
    marginTop: 20,
    alignItems: 'center',
  },
  changeStatusButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    justifyContent: 'space-between',
  },
  cookItemSelected: { backgroundColor: '#f0f9ff' },
  cookName: { fontSize: 16, fontWeight: '500' },
  cookSpec: { fontSize: 14, color: '#666', marginLeft: 8 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  cancelButtonText: { color: '#666', fontWeight: '600' },
  confirmButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  confirmButtonText: { color: '#fff', fontWeight: '600' },
});

export default ChefOrders;