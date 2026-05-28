import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
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
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import styles from '../design/ChefOrdersStyles';

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
  course_number: number;
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
  plates: OrderPlate[];
}

interface ActiveTask {
  plate_order_id: number;
  plate_id: number;
  started_at: string;
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
  course_number: number;
  highlightedAsEarlyCourse?: boolean;
  recommended?: boolean;
  recommendedCookId?: number;
  recommendedCookName?: string;
  priorityScore?: number;
}

interface Cook {
  id: number;
  name: string;
  specialization?: Specialization;
}

type StatusFilter = 'waiting' | 'preparing' | 'ready';
type SpecializationFilter = 'all' | number;

const ChefOrders = () => {
  const { user } = useAuth();
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

  const [loadingChange, setLoadingChange] = useState(false);
  const [loadingRollback, setLoadingRollback] = useState(false);

  const plateToSpecializations = useRef<Map<number, Set<number>>>(new Map());

  const loadAllowedPlateIds = useCallback(async (): Promise<Set<number>> => {
    const specializationIds = new Set<number>();
    const specializationsMap = new Map<number, Specialization>();
    try {
      const userRes = await api.get(`/users/${user?.id}`);
      const currentUser = userRes.data;

      if (currentUser.specialization?.id) {
        specializationIds.add(currentUser.specialization.id);
        specializationsMap.set(currentUser.specialization.id, currentUser.specialization);
      }

      if (currentUser.cook_groups && currentUser.cook_groups.length > 0) {
        for (const group of currentUser.cook_groups) {
          const cooksRes = await api.get(`/cook-groups/${group.id}/cooks/`);
          const cooks = cooksRes.data;
          cooks.forEach((cook: any) => {
            if (cook.specialization?.id) {
              specializationIds.add(cook.specialization.id);
              specializationsMap.set(cook.specialization.id, cook.specialization);
            }
          });
        }
      }

      const allowedPlateIds = new Set<number>();
      const newPlateToSpec = new Map<number, Set<number>>();

      for (const specId of specializationIds) {
        const platesRes = await api.get(`/plates-specializations/specialization/${specId}`);
        const plates: PlatesForSpecializationLink[] = platesRes.data;
        plates.forEach(link => {
          allowedPlateIds.add(link.plate_id);
          if (!newPlateToSpec.has(link.plate_id)) {
            newPlateToSpec.set(link.plate_id, new Set());
          }
          newPlateToSpec.get(link.plate_id)!.add(specId);
        });
      }

      plateToSpecializations.current = newPlateToSpec;
      setAvailableSpecializations(Array.from(specializationsMap.values()));

      return allowedPlateIds;
    } catch (error) {
      console.error('Ошибка получения разрешённых блюд', error);
      return new Set<number>();
    }
  }, [user?.id]);

  const loadGroupCooks = useCallback(async () => {
    try {
      const userRes = await api.get(`/users/${user?.id}`);
      const currentUser = userRes.data;
      const cooksMap = new Map<number, Cook>();

      if (currentUser.cook_groups && currentUser.cook_groups.length > 0) {
        for (const group of currentUser.cook_groups) {
          const cooksRes = await api.get(`/cook-groups/${group.id}/cooks/`);
          const cooks = cooksRes.data;
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
      setGroupCooks(Array.from(cooksMap.values()));
    } catch (error) {
      console.error('Ошибка загрузки поваров группы', error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
    loadGroupCooks();
  }, []);

  const fetchActiveTasks = useCallback(async (cookId: number): Promise<ActiveTask[]> => {
    try {
      const res = await api.get(`/orders/${cookId}/active-tasks`);
      return res.data;
    } catch {
      return [];
    }
  }, []);

  const computeEarlyCourseHighlight = useCallback((plates: FlatOrderedPlate[]): FlatOrderedPlate[] => {
    const orderMap = new Map<number, FlatOrderedPlate[]>();
    plates.forEach(p => {
      const arr = orderMap.get(p.order_id) || [];
      arr.push(p);
      orderMap.set(p.order_id, arr);
    });

    return plates.map(p => {
      const siblings = orderMap.get(p.order_id) || [];
      const minCourse = Math.min(...siblings.map(s => s.course_number));
      const maxCourse = Math.max(...siblings.map(s => s.course_number));
      const highlight = (minCourse !== maxCourse) && (p.course_number === minCourse);
      return { ...p, highlightedAsEarlyCourse: highlight };
    });
  }, []);

  const computeRecommendations = useCallback(async (
    plates: FlatOrderedPlate[],
    currentCookId: number,
    groupCooks: Cook[]
  ): Promise<FlatOrderedPlate[]> => {
    if (plates.length === 0) return plates;

    const tasksPromises = groupCooks.map(cook => fetchActiveTasks(cook.id));
    const allTasks = await Promise.all(tasksPromises);
    const tasksMap = new Map<number, ActiveTask[]>();
    groupCooks.forEach((cook, idx) => tasksMap.set(cook.id, allTasks[idx]));

    const uniquePlateIds = [...new Set(plates.map(p => p.plate_id))];

    const avgCache = new Map<string, number>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = (d: Date) => d.toISOString().split('T')[0];

    await Promise.all(groupCooks.map(async (cook) => {
      await Promise.all(uniquePlateIds.map(async (plateId) => {
        const key = `${cook.id}_${plateId}`;
        if (avgCache.has(key)) return;
        try {
          const res = await api.get('/statistics/kitchen/details', {
            params: {
              start_date: dateStr(thirtyDaysAgo),
              end_date: dateStr(new Date()),
              cook_id: cook.id,
              plate_id: plateId
            }
          });
          const avgItem = res.data.avg_preparation_time?.find((item: any) => item.plate_id === plateId);
          if (avgItem && typeof avgItem.avg_minutes === 'number') {
            avgCache.set(key, avgItem.avg_minutes);
          }
        } catch {}
      }));
    }));

    const getAvg = (cookId: number, plateId: number): number => {
      return avgCache.get(`${cookId}_${plateId}`) ?? 20;
    };

    const now = Date.now();
    const busyUntilMap = new Map<number, number>();
    for (const cook of groupCooks) {
      const tasks = tasksMap.get(cook.id) || [];
      let maxRemaining = 0;
      for (const task of tasks) {
        const avgTime = getAvg(cook.id, task.plate_id);
        const elapsed = (now - new Date(task.started_at).getTime()) / 60000;
        const remaining = Math.max(0, avgTime - elapsed);
        if (remaining > maxRemaining) {
          maxRemaining = remaining;
        }
      }
      busyUntilMap.set(cook.id, maxRemaining);
    }

    const enrichedPlates = plates.map(plate => {
      let bestCookId: number | null = null;
      let bestCookName = '';
      let bestTime = Infinity;

      for (const cook of groupCooks) {
        const specsOfPlate = plateToSpecializations.current.get(plate.plate_id);
        if (!specsOfPlate || !cook.specialization || !specsOfPlate.has(cook.specialization.id)) {
          continue;
        }

        const avgTime = getAvg(cook.id, plate.plate_id);
        const completionTime = (busyUntilMap.get(cook.id) || 0) + avgTime;
        if (completionTime < bestTime) {
          bestTime = completionTime;
          bestCookId = cook.id;
          bestCookName = cook.name;
        }
      }

      return {
        ...plate,
        recommendedCookId: bestCookId ?? undefined,
        recommendedCookName: bestCookName || undefined,
        recommended: bestCookId === currentCookId,
        priorityScore: bestTime !== Infinity ? bestTime : undefined,
      };
    });

    enrichedPlates.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (a.highlightedAsEarlyCourse !== b.highlightedAsEarlyCourse) return a.highlightedAsEarlyCourse ? -1 : 1;
      if (a.course_number !== b.course_number) return a.course_number - b.course_number;
      return (a.priorityScore ?? Infinity) - (b.priorityScore ?? Infinity);
    });

    return enrichedPlates;
  }, [fetchActiveTasks]);

  const applyFilter = useCallback(async (
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

    const withHighlight = computeEarlyCourseHighlight(filtered);

    let withRecs: FlatOrderedPlate[];
    if (specF !== 'all') {
      try {
        withRecs = await computeRecommendations(withHighlight, user?.id ?? 0, groupCooks);
      } catch (error) {
        console.error('Ошибка расчёта рекомендаций:', error);
        withRecs = withHighlight.map(p => ({ ...p, recommended: false }));
      }
    } else {
      withRecs = withHighlight.map(p => ({ ...p, recommended: false }));
    }

    const sortedItems = withRecs.sort((a, b) => {
      if (a.highlightedAsEarlyCourse !== b.highlightedAsEarlyCourse) return a.highlightedAsEarlyCourse ? -1 : 1;
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (a.course_number !== b.course_number) return a.course_number - b.course_number;
      if (specF !== 'all') {
        return (a.priorityScore ?? Infinity) - (b.priorityScore ?? Infinity);
      } else {
        return new Date(a.timestart).getTime() - new Date(b.timestart).getTime();
      }
    });

    setFilteredItems(sortedItems);
  }, [user?.id, groupCooks, computeEarlyCourseHighlight, computeRecommendations]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const allowedPlateIds = await loadAllowedPlateIds();
      if (allowedPlateIds.size === 0) {
        setItems([]);
        setFilteredItems([]);
        return;
      }

      const ordersRes = await api.get('/orders/?status=active');
      const orders: Order[] = ordersRes.data;

      const groupedMap = new Map<string, FlatOrderedPlate>();
      for (const order of orders) {
        for (const plate of order.plates) {
          if (plate.is_considered === false) continue;
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
              course_number: plate.course_number,
            });
          }
        }
      }

      const flatList = Array.from(groupedMap.values());
      flatList.sort((a, b) => new Date(a.timestart).getTime() - new Date(b.timestart).getTime());
      setItems(flatList);
      await applyFilter(flatList, statusFilter, specializationFilter);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAllowedPlateIds, statusFilter, specializationFilter, applyFilter]);

  useEffect(() => {
    applyFilter(items, statusFilter, specializationFilter);
  }, [statusFilter, specializationFilter, items, applyFilter]);

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

    const allowedSpecs = selectedItem
      ? plateToSpecializations.current.get(selectedItem.plate_id)
      : null;
    const currentUserAllowed =
      allowedSpecs && user?.id
        ? groupCooks.find(c => c.id === user.id && c.specialization && allowedSpecs.has(c.specialization.id))
        : null;

    setSelectedCookId(currentUserAllowed ? user?.id ?? null : null);
    setChangeStatusModalVisible(true);
  };

  const changePlateStatus = async () => {
    if (!selectedItem || !targetStatus || !selectedCookId) return;
    setLoadingChange(true);
    try {
      await api.put(`/orders/plate/${selectedItem.plate_order_id}/status/${targetStatus}?change_by=${selectedCookId}`);
      setChangeStatusModalVisible(false);
      setDetailModalVisible(false);
      loadData();
      Alert.alert('Успех', `Статус изменён на "${getStatusLabel(targetStatus)}"`);
    } catch (error: any) {
      const msg = error.response?.status === 409
        ? "Этот статус уже установлен другим поваром"
        : (error.response?.data?.detail || error.message || 'Не удалось изменить статус');
      Alert.alert('Ошибка', msg);
      setChangeStatusModalVisible(false);
      setDetailModalVisible(false);
      loadData();
    } finally {
      setLoadingChange(false);
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

  const rollbackStatus = async (plateOrderId: number, expectedCurrentStatus: string) => {
    setLoadingRollback(true);
    try {
      await api.delete(`/cooking-status-history/rollback/${plateOrderId}`, {
        params: { expected_current_status: expectedCurrentStatus }
      });
      Alert.alert('Успешно', 'Статус откачен');
      setDetailModalVisible(false);
      loadData();
    } catch (error: any) {
      const msg = error.response?.status === 409
        ? "Статус уже изменен другим поваром"
        : (error.response?.data?.detail || error.message || 'Не удалось откатить статус');
      Alert.alert('Ошибка', msg);
      setDetailModalVisible(false);
      loadData();
    } finally {
      setLoadingRollback(false);
    }
  };

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (data.type === 'new_order' ||
        data.type === 'plate_status_changed' ||
        data.type === 'order_updated') {
        handleRefresh();
      }
    });
    return unsubscribe;
  }, [addHandler, handleRefresh]);

  const grouped = useMemo(() => {
    const personal: FlatOrderedPlate[] = [];
    const otherMap = new Map<number, { cook: Cook; plates: FlatOrderedPlate[] }>();
    const unassigned: FlatOrderedPlate[] = [];

    if (specializationFilter === 'all' || statusFilter !== 'waiting') {
      filteredItems.forEach(item => unassigned.push(item));
      return { personal, otherMap, unassigned };
    }

    filteredItems.forEach(item => {
      if (item.recommended) {
        personal.push(item);
      } else if (item.recommendedCookId && item.recommendedCookId !== user?.id) {
        const cook = groupCooks.find(c => c.id === item.recommendedCookId);
        if (cook) {
          if (!otherMap.has(cook.id)) {
            otherMap.set(cook.id, { cook, plates: [] });
          }
          otherMap.get(cook.id)!.plates.push(item);
        } else {
          unassigned.push(item);
        }
      } else {
        unassigned.push(item);
      }
    });

    return { personal, otherMap, unassigned };
  }, [filteredItems, user?.id, groupCooks, specializationFilter]);

  const renderSliderCard = (item: FlatOrderedPlate) => (
    <TouchableOpacity key={item.uid} style={styles.recommendedCard} onPress={() => openDetail(item)}>
      <Text style={styles.recPlateName} numberOfLines={1}>{item.plate_name}</Text>
      <Text style={styles.recCount}>x{item.count}</Text>
      <Text style={styles.recOrder}>Заказ #{item.order_id}</Text>
      {item.highlightedAsEarlyCourse && <Ionicons name="timer-outline" size={14} color="#e67e22" />}
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: FlatOrderedPlate }) => {
    const statusInfo = getStatusInfo(item.current_status);
    const isRecommendedForCurrentUser = item.recommended && specializationFilter !== 'all';
    const recommendedByOther = item.recommendedCookId && item.recommendedCookId !== user?.id;

    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.7}>
        {item.highlightedAsEarlyCourse && (
          <View style={styles.earlyCourseIndicator} />
        )}
        <View style={styles.cardHeader}>
          <Text style={styles.plateName}>
            {item.plate_name}
            {isRecommendedForCurrentUser && (
              <Ionicons name="star" size={16} color="#f1c40f" style={{ marginLeft: 6 }} />
            )}
          </Text>
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
        {item.highlightedAsEarlyCourse && (
          <Text style={styles.earlyCourseLabel}> Повышенный приоритет</Text>
        )}
        {recommendedByOther && (
          <Text style={styles.recommendedCookLabel}>
            {item.recommendedCookName}
          </Text>
        )}
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

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {renderFilterChip('waiting', 'Ожидает', statusFilter, setStatusFilter)}
          {renderFilterChip('preparing', 'Готовится', statusFilter, setStatusFilter)}
          {renderFilterChip('ready', 'Готово', statusFilter, setStatusFilter)}
        </ScrollView>
      </View>

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

      {statusFilter === 'waiting' && grouped.personal.length > 0 && (
        <View style={styles.recommendedSection}>
          <Text style={styles.sectionTitle}> {user?.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {grouped.personal.map(item => renderSliderCard(item))}
          </ScrollView>
        </View>
      )}

      {statusFilter === 'waiting' && Array.from(grouped.otherMap.entries()).map(([cookId, { cook, plates }]) => (
        <View key={cookId} style={styles.recommendedSection}>
          <Text style={styles.sectionTitle}> {cook.name} </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {plates.map(item => renderSliderCard(item))}
          </ScrollView>
        </View>
      ))}

      <FlatList
        data={grouped.unassigned}
        renderItem={renderItem}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#FF6B6B']} />
        }
        ListEmptyComponent={
          grouped.personal.length === 0 && grouped.otherMap.size === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="flame-outline" size={60} color="#ccc" />
              <Text>Нет заказов</Text>
            </View>
          ) : null
        }
      />

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
                {(selectedItem.current_status === 'preparing' || selectedItem.current_status === 'ready') && (
                  <TouchableOpacity
                    style={[styles.changeStatusButton, { backgroundColor: '#e74c3c' }]}
                    onPress={() => {
                      setDetailModalVisible(false);
                      rollbackStatus(selectedItem.plate_order_id, selectedItem.current_status);
                    }}
                  >
                    <Text style={styles.changeStatusButtonText}>Откатить статус</Text>
                  </TouchableOpacity>
                )}
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

      <Modal visible={changeStatusModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Кто выполняет?</Text>
            <FlatList
              data={groupCooks.filter(cook => {
                if (!selectedItem) return false;
                const allowedSpecs = plateToSpecializations.current.get(selectedItem.plate_id);
                if (!allowedSpecs) return false;
                return cook.specialization ? allowedSpecs.has(cook.specialization.id) : false;
              })}
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

export default ChefOrders;