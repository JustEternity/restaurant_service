import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/AdminReportsStyles';

interface Order {
  id: number;
  timestart: string;
  status: string;
  plates: {
    plate_id: number;
    plate_name: string;
    count: number;
    price: number;
    current_status: string;
  }[];
  table_numbers: number[];
  waiter: number;
  waiter_name: string;
}

interface User {
  id: number;
  name: string;
}

interface MenuItem {
  id: number;
  name: string;
}

interface GeneralStats {
  total_orders: number;
  total_revenue: number;
  avg_check: number;
  total_dishes: number;
  avg_dishes_per_order: number;
  avg_order_time_minutes: number;
}

interface KitchenStats {
  total_cooked: number;
  top_dishes: {
    plate_id: number;
    plate_name: string;
    cooked_count: number;
  }[];
}

interface KitchenDetail {
  avg_preparation_time: {
    plate_id: number;
    plate_name: string;
    avg_minutes: number;
  }[];
  avg_waiting_time: {
    plate_id: number;
    plate_name: string;
    avg_minutes: number;
  }[];
  cook_dish_frequency: {
    cook_id: number;
    cook_name: string;
    plate_id: number;
    plate_name: string;
    cooked_count: number;
  }[];
}

interface TableOrderCount {
  table_number: number;
  order_count: number;
}

interface CookWorkload {
  cook_id: number;
  cook_name: string;
  total_count: number;
  dishes: {
    plate_id: number;
    plate_name: string;
    count: number;
    status: 'preparing' | 'ready';
  }[];
}

type TabType = 'general' | 'kitchen' | 'waiters';

const AdminReports = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [generalStats, setGeneralStats] = useState<GeneralStats | null>(null);
  const [tableOrders, setTableOrders] = useState<TableOrderCount[]>([]);
  const [kitchenStats, setKitchenStats] = useState<KitchenStats | null>(null);
  const [kitchenDetail, setKitchenDetail] = useState<KitchenDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [waiters, setWaiters] = useState<User[]>([]);
  const [cooks, setCooks] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedWaiter, setSelectedWaiter] = useState<User | null>(null);
  const [selectedCook, setSelectedCook] = useState<User | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<MenuItem | null>(null);
  const [showWaiterPicker, setShowWaiterPicker] = useState(false);
  const [showCookPicker, setShowCookPicker] = useState(false);
  const [showPlatePicker, setShowPlatePicker] = useState(false);
  const [showAllDishesModal, setShowAllDishesModal] = useState(false);

  const [cookWorkload, setCookWorkload] = useState<CookWorkload[]>([]);
  const [showWorkloadModal, setShowWorkloadModal] = useState(false);

  const handleStartDateChange = (_: any, d?: Date) => {
    if (d) setStartDate(d);
    if (Platform.OS === 'android') setShowStartPicker(false);
  };
  const handleEndDateChange = (_: any, d?: Date) => {
    if (d) setEndDate(d);
    if (Platform.OS === 'android') setShowEndPicker(false);
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formatApiDate = (d: Date) => d.toISOString().split('T')[0];

  const loadAll = useCallback(async () => {
    setLoading(true);
    const params = `start_date=${formatApiDate(startDate)}&end_date=${formatApiDate(endDate)}`;
    try {
      const [genRes, tabRes] = await Promise.all([
        api.get(`/statistics/general?${params}`),
        api.get(`/statistics/general/tables?${params}`),
      ]);
      setGeneralStats(genRes.data);
      setTableOrders(tabRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const loadOrders = useCallback(async () => {
    try {
      const res = await api.get(`/orders/?start_date=${formatApiDate(startDate)}&end_date=${formatApiDate(endDate)}`);
      setOrders(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [startDate, endDate]);

  const loadKitchenDetail = useCallback(async () => {
    const params = new URLSearchParams({
      start_date: formatApiDate(startDate),
      end_date: formatApiDate(endDate),
    });
    if (selectedCook) params.append('cook_id', selectedCook.id.toString());
    if (selectedPlate) params.append('plate_id', selectedPlate.id.toString());

    try {
      const [kitRes, detRes] = await Promise.all([
        api.get(`/statistics/kitchen?${params.toString()}`),
        api.get(`/statistics/kitchen/details?${params.toString()}`),
      ]);
      setKitchenStats(kitRes.data);
      setKitchenDetail(detRes.data);
    } catch (err) {
      console.error(err);
    }
  }, [startDate, endDate, selectedCook, selectedPlate]);

  const loadWaiters = async () => {
    try {
      const res = await api.get('/users/?role=waiter');
      setWaiters(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const loadCooks = async () => {
    try {
      const res = await api.get('/users/?role=cook');
      setCooks(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const loadMenu = async () => {
    try {
      const res = await api.get('/menu/');
      setMenuItems(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadWorkload = async () => {
    try {
      const res = await api.get('/statistics/kitchen/workload');
      setCookWorkload(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAll();
    loadOrders();
  }, [startDate, endDate]);

  useEffect(() => {
      loadKitchenDetail();
  }, [startDate, endDate, selectedCook, selectedPlate]);

  useEffect(() => {
    loadWaiters();
    loadCooks();
    loadMenu();
  }, []);

  const filteredOrders = orders.filter(o => o.status === 'completed');
  const waiterOrders = selectedWaiter
    ? filteredOrders.filter(o => o.waiter === selectedWaiter.id)
    : filteredOrders;
  const waiterTotalOrders = waiterOrders.length;
  const waiterTotalRevenue = waiterOrders.reduce(
    (sum, o) => sum + o.plates.reduce((s, p) => s + p.price * p.count, 0),
    0
  );
  const waiterAvgCheck = waiterTotalOrders > 0 ? waiterTotalRevenue / waiterTotalOrders : 0;
  const waiterTotalDishes = waiterOrders.reduce(
    (sum, o) => sum + o.plates.reduce((s, p) => s + p.count, 0),
    0
  );
  const waiterAvgDishes = waiterTotalOrders > 0 ? waiterTotalDishes / waiterTotalOrders : 0;

  const aggregatedTable = useMemo(() => {
    if (!kitchenDetail) return [];

    const map = new Map<number, { name: string; cookedCount: number; avgPrep: number | null; avgWait: number | null }>();

    kitchenDetail.cook_dish_frequency.forEach(item => {
      if (!map.has(item.plate_id)) {
        map.set(item.plate_id, {
          name: item.plate_name,
          cookedCount: 0,
          avgPrep: null,
          avgWait: null,
        });
      }
      const entry = map.get(item.plate_id)!;
      entry.cookedCount += item.cooked_count;
    });

    kitchenDetail.avg_preparation_time.forEach(item => {
      if (!map.has(item.plate_id)) {
        map.set(item.plate_id, {
          name: item.plate_name,
          cookedCount: 0,
          avgPrep: null,
          avgWait: null,
        });
      }
      map.get(item.plate_id)!.avgPrep = item.avg_minutes;
    });

    kitchenDetail.avg_waiting_time.forEach(item => {
      if (!map.has(item.plate_id)) {
        map.set(item.plate_id, {
          name: item.plate_name,
          cookedCount: 0,
          avgPrep: null,
          avgWait: null,
        });
      }
      map.get(item.plate_id)!.avgWait = item.avg_minutes;
    });

    return Array.from(map.entries())
        .filter(([_, data]) => data.cookedCount > 0)
        .map(([plateId, data]) => ({ plateId, ...data }));
  }, [kitchenDetail]);

  if (loading && !generalStats) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.datePickerRow}>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
          <Ionicons name="calendar-outline" size={18} color="#007AFF" />
          <Text style={styles.dateButtonText}>С: {formatDate(startDate)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
          <Ionicons name="calendar-outline" size={18} color="#007AFF" />
          <Text style={styles.dateButtonText}>По: {formatDate(endDate)}</Text>
        </TouchableOpacity>
      </View>
      {showStartPicker && (
        <DateTimePicker value={startDate} mode="date" display="default" onChange={handleStartDateChange} />
      )}
      {showEndPicker && (
        <DateTimePicker value={endDate} mode="date" display="default" onChange={handleEndDateChange} />
      )}

      <View style={styles.tabsContainer}>
        {(['general', 'kitchen', 'waiters'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab === 'general' ? 'Общее' : tab === 'kitchen' ? 'Кухня' : 'Официанты'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'general' && generalStats && (
          <View>
            <ReportCard title="Всего заказов" value={generalStats.total_orders} icon="receipt-outline" />
            <ReportCard title="Общая выручка" value={`${generalStats.total_revenue.toFixed(2)} ₽`} icon="cash-outline" />
            <ReportCard title="Средний чек" value={`${generalStats.avg_check.toFixed(2)} ₽`} icon="card-outline" />
            <ReportCard title="Общее количество блюд" value={generalStats.total_dishes} icon="restaurant-outline" />
            <ReportCard title="Среднее количество блюд в заказе" value={generalStats.avg_dishes_per_order.toFixed(1)} icon="restaurant-outline" />
            <ReportCard title="Среднее время выполнения заказа" value={`${generalStats.avg_order_time_minutes.toFixed(0)} мин`} icon="time-outline" />
            {tableOrders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Заказы по столам</Text>
                {tableOrders.map(t => (
                  <View key={t.table_number} style={styles.listItem}>
                    <Text style={styles.listItemText}>Стол {t.table_number}: {t.order_count} зак.</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'waiters' && (
          <View>
            <TouchableOpacity style={styles.pickerButton} onPress={() => setShowWaiterPicker(true)}>
              <Text style={styles.pickerButtonText}>{selectedWaiter ? selectedWaiter.name : 'Все официанты'}</Text>
              <Ionicons name="chevron-down" size={18} color="#666" />
            </TouchableOpacity>
            <ReportCard title="Количество заказов" value={waiterTotalOrders} icon="receipt-outline" />
            <ReportCard title="Средний чек" value={`${waiterAvgCheck.toFixed(2)} ₽`} icon="cash-outline" />
            <ReportCard title="Среднее количество блюд в заказе" value={waiterAvgDishes.toFixed(1)} icon="restaurant-outline" />
          </View>
        )}

        {activeTab === 'kitchen' && kitchenStats && kitchenDetail && (
          <View>
            <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPlatePicker(true)}>
              <Text style={styles.pickerButtonText}>
                {selectedPlate ? selectedPlate.name : 'Все блюда'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerButton} onPress={() => setShowCookPicker(true)}>
              <Text style={styles.pickerButtonText}>
                {selectedCook ? selectedCook.name : 'Все повара'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#666" />
            </TouchableOpacity>

            <ReportCard title="Приготовлено порций" value={kitchenStats.total_cooked} icon="flame-outline" />

            {!selectedPlate && kitchenStats.top_dishes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Топ-3 блюда</Text>
                {kitchenStats.top_dishes.map(d => (
                  <View key={d.plate_id} style={styles.listItem}>
                    <Text style={styles.listItemText}>
                      {d.plate_name}: {d.cooked_count} порц.
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {selectedPlate && (
              <>
                {kitchenDetail.avg_preparation_time.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Среднее время приготовления (мин)</Text>
                    {kitchenDetail.avg_preparation_time.map(d => (
                      <View key={d.plate_id} style={styles.listItem}>
                        <Text style={styles.listItemText}>
                          {d.plate_name}: {d.avg_minutes} мин
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {kitchenDetail.avg_waiting_time.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Среднее время ожидания (мин)</Text>
                    {kitchenDetail.avg_waiting_time.map(d => (
                      <View key={d.plate_id} style={styles.listItem}>
                        <Text style={styles.listItemText}>
                          {d.plate_name}: {d.avg_minutes} мин
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {!selectedPlate && (
              <TouchableOpacity
                style={styles.additionalButton}
                onPress={() => setShowAllDishesModal(true)}
              >
                <Ionicons name="restaurant-outline" size={20} color="#007AFF" />
                <Text style={styles.additionalButtonText}>Все блюда</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.additionalButton}
              onPress={() => { loadWorkload(); setShowWorkloadModal(true); }}
            >
              <Ionicons name="people-outline" size={20} color="#007AFF" />
              <Text style={styles.additionalButtonText}>Загруженность поваров</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Модальное окно таблицы */}
      <Modal visible={showAllDishesModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>Детали блюд</Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Блюдо</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Порций</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Пригот. (мин)</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Ожидание (мин)</Text>
            </View>

            <FlatList
              data={aggregatedTable}
              keyExtractor={item => item.plateId.toString()}
              renderItem={({ item }) => (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{item.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{item.cookedCount}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>
                    {item.avgPrep != null ? item.avgPrep : '—'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>
                    {item.avgWait != null ? item.avgWait : '—'}
                  </Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>Нет данных</Text>}
            />

            <TouchableOpacity style={styles.closeButton} onPress={() => setShowAllDishesModal(false)}>
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Модальные окна выбора */}
      <Modal visible={showWaiterPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FlatList
              data={[{ id: 0, name: 'Все официанты' }, ...waiters]}
              keyExtractor={i => i.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedWaiter(item.id === 0 ? null : item);
                    setShowWaiterPicker(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowWaiterPicker(false)}>
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCookPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FlatList
              data={[{ id: 0, name: 'Все повара' }, ...cooks]}
              keyExtractor={i => i.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedCook(item.id === 0 ? null : item);
                    setShowCookPicker(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowCookPicker(false)}>
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPlatePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FlatList
              data={[{ id: 0, name: 'Все блюда' }, ...menuItems]}
              keyExtractor={i => i.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedPlate(item.id === 0 ? null : item);
                    setShowPlatePicker(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowPlatePicker(false)}>
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showWorkloadModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>Загруженность поваров</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Повар</Text>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Блюда</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Порций</Text>
            </View>

            <FlatList
              data={cookWorkload}
              keyExtractor={item => item.cook_id?.toString() ?? 'unknown'}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Нет активных блюд</Text>
              }
              renderItem={({ item }) => (
                <View style={[styles.tableRow, { alignItems: 'flex-start' }]}>
                  <Text style={[styles.tableCell, { flex: 2, paddingTop: 4 }]}>
                    {item.cook_name}
                  </Text>
                  <View style={{ flex: 3 }}>
                    {item.dishes.map((d, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 0 }}>
                        <Text style={{
                          fontSize: 10,
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 4,
                          overflow: 'hidden',
                          backgroundColor: d.status === 'preparing' ? '#FFF3CD' : '#D4EDDA',
                          color: d.status === 'preparing' ? '#856404' : '#155724',
                        }}>
                          {d.status === 'preparing' ? '⌛' : '✅'}
                        </Text>
                        <Text style={[styles.tableCell, { flex: 1 }]}>
                          {d.plate_name} × {d.count}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', paddingTop: 4 }]}>
                    {item.total_count}
                  </Text>
                </View>
              )}
            />

            <TouchableOpacity style={styles.closeButton} onPress={() => setShowWorkloadModal(false)}>
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const ReportCard = ({ title, value, icon }: { title: string; value: string | number; icon: string }) => (
  <View style={styles.reportCard}>
    <Ionicons name={icon as any} size={24} color="#007AFF" style={styles.reportIcon} />
    <View style={styles.reportInfo}>
      <Text style={styles.reportTitle}>{title}</Text>
      <Text style={styles.reportValue}>{value}</Text>
    </View>
  </View>
);

export default AdminReports;