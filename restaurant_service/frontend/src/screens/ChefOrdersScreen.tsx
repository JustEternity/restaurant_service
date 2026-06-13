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
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton } from 'react-native-gesture-handler';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import api from '../services/api';
import styles from '../design/ChefOrdersStyles';
import { applyRecommendations } from '../services/recommendation';

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
  cook_id_preparing?: number | null;
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
  course_number: number;
  highlightedAsEarlyCourse?: boolean;
  recommended?: boolean;
  recommendedCookId?: number;
  recommendedCookName?: string;
  priorityScore?: number;
  waitingMinutes?: number;
  cook_id_preparing?: number | null;
}

interface Cook {
  id: number;
  name: string;
  specialization?: Specialization;
}

type StatusFilter = 'waiting' | 'preparing' | 'ready';
type SpecializationFilter = 'all' | number;

const isCourseDone = (status: string) =>
  status === 'ready' || status === 'served';

const ChefOrders = () => {
  const { user } = useAuth();

  const [items, setItems] = useState<FlatOrderedPlate[]>([]);
  const [allOrderPlates, setAllOrderPlates] = useState<Map<number, OrderPlate[]>>(new Map());
  const [filteredItems, setFilteredItems] = useState<FlatOrderedPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FlatOrderedPlate | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('waiting');
  const [cookFilter, setCookFilter] = useState<number | 'all'>('all');
  const [specializationFilter, setSpecializationFilter] = useState<SpecializationFilter>('all');
  const [availableSpecializations, setAvailableSpecializations] = useState<Specialization[]>([]);

  const [changeStatusModalVisible, setChangeStatusModalVisible] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [groupCooks, setGroupCooks] = useState<Cook[]>([]);
  const [selectedCookId, setSelectedCookId] = useState<number | null>(null);

  const [loadingChange, setLoadingChange] = useState(false);
  const [loadingRollback, setLoadingRollback] = useState(false);

  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedUids.size > 0;
  const canMultiSelect =
    (statusFilter === 'waiting' && specializationFilter !== 'all') ||
    ((statusFilter === 'preparing' || statusFilter === 'ready') && cookFilter !== 'all');

  const [bulkListModalVisible, setBulkListModalVisible] = useState(false);
  const [bulkStatusModalVisible, setBulkStatusModalVisible] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<string>('');
  const [bulkSelectedCookId, setBulkSelectedCookId] = useState<number | null>(null);
  const [bulkLoadingChange, setBulkLoadingChange] = useState(false);

  const plateToSpecializations = useRef<Map<number, Set<number>>>(new Map());
  const statsCacheRef = useRef<{ ts: number; data: Map<string, number> }>({ ts: 0, data: new Map() });

  const selectedItems = useMemo(
    () => filteredItems.filter(i => selectedUids.has(i.uid)),
    [filteredItems, selectedUids]
  );

  const bulkEligibleCooks = useMemo(() => {
    if (selectedUids.size === 0) return groupCooks;
    const allowedSpecIds = new Set<number>();
    for (const uid of selectedUids) {
      const item = filteredItems.find(i => i.uid === uid);
      if (item) {
        const specs = plateToSpecializations.current.get(item.plate_id);
        specs?.forEach(s => allowedSpecIds.add(s));
      }
    }
    return groupCooks.filter(c => c.specialization && allowedSpecIds.has(c.specialization.id));
  }, [selectedUids, filteredItems, groupCooks]);

  const toggleSelectItem = useCallback((item: FlatOrderedPlate) => {
    setSelectedUids(prev => {
      const next = new Set(prev);
      if (next.has(item.uid)) next.delete(item.uid);
      else next.add(item.uid);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedUids(new Set()), []);

  const handleCardPress = useCallback(
    (item: FlatOrderedPlate) => {
      if (selectedUids.has(item.uid)) {
        setBulkListModalVisible(true);
      } else {
        setSelectedItem(item);
        setDetailModalVisible(true);
      }
    },
    [selectedUids]
  );

  const openBulkStatusChange = useCallback(
    async (nextStatus: string) => {
      setBulkTargetStatus(nextStatus);
      if (nextStatus === 'ready') {
        setBulkLoadingChange(true);
        let successCount = 0;
        let failCount = 0;
        for (const uid of selectedUids) {
          const item = filteredItems.find(i => i.uid === uid);
          if (!item) continue;
          const cookId = item.cook_id_preparing;
          if (!cookId) { failCount++; continue; }
          try {
            await api.put(
              `/orders/plate/${item.plate_order_id}/status/ready?change_by=${cookId}`
            );
            successCount++;
          } catch {
            failCount++;
          }
        }
        setBulkLoadingChange(false);
        clearSelection();
        loadData();
        if (failCount > 0) {
          Alert.alert('Результат', `Изменено: ${successCount}, ошибок: ${failCount}`);
        }
        return;
      }
      const currentUserAllowed = user?.id
        ? bulkEligibleCooks.find(c => c.id === user.id)
        : null;
      setBulkSelectedCookId(currentUserAllowed ? user!.id : null);
      setBulkStatusModalVisible(true);
    },
    [bulkEligibleCooks, user, selectedUids, filteredItems]
  );

  const confirmBulkStatusChange = useCallback(async () => {
    if (selectedUids.size === 0) return;
    setBulkLoadingChange(true);
    let successCount = 0;
    let failCount = 0;

    for (const uid of selectedUids) {
      const item = filteredItems.find(i => i.uid === uid);
      if (!item) continue;
      const cookId = bulkTargetStatus === 'ready' ? item.cook_id_preparing : bulkSelectedCookId;
      if (!cookId) { failCount++; continue; }
      try {
        await api.put(
          `/orders/plate/${item.plate_order_id}/status/${bulkTargetStatus}?change_by=${cookId}`
        );
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkLoadingChange(false);
    setBulkStatusModalVisible(false);
    setBulkListModalVisible(false);
    clearSelection();
    loadData();

    if (failCount > 0) {
      Alert.alert('Результат', `Изменено: ${successCount}, ошибок: ${failCount}`);
    }
  }, [selectedUids, filteredItems, bulkTargetStatus, bulkSelectedCookId]);

  const confirmBulkRollback = useCallback(async () => {
    if (selectedUids.size === 0) return;
    setBulkLoadingChange(true);
    let successCount = 0;
    let failCount = 0;

    for (const uid of selectedUids) {
      const item = filteredItems.find(i => i.uid === uid);
      if (!item) continue;
      try {
        await api.delete(`/cooking-status-history/rollback/${item.plate_order_id}`, {
          params: { expected_current_status: item.current_status },
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkLoadingChange(false);
    clearSelection();
    loadData();
    if (failCount > 0) {
      Alert.alert('Результат', `Откачено: ${successCount}, ошибок: ${failCount}`);
    }
  }, [selectedUids, filteredItems]);

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

      if (currentUser.cook_groups?.length > 0) {
        for (const group of currentUser.cook_groups) {
          const cooksRes = await api.get(`/cook-groups/${group.id}/cooks/`);
          cooksRes.data.forEach((cook: any) => {
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
        (platesRes.data as PlatesForSpecializationLink[]).forEach(link => {
          allowedPlateIds.add(link.plate_id);
          if (!newPlateToSpec.has(link.plate_id)) newPlateToSpec.set(link.plate_id, new Set());
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
      if (currentUser.cook_groups?.length > 0) {
        for (const group of currentUser.cook_groups) {
          const cooksRes = await api.get(`/cook-groups/${group.id}/cooks/`);
          cooksRes.data.forEach((c: any) => {
            if (!cooksMap.has(c.id))
              cooksMap.set(c.id, { id: c.id, name: c.name, specialization: c.specialization });
          });
        }
      }
      setGroupCooks(Array.from(cooksMap.values()));
    } catch (error) {
      console.error('Ошибка загрузки поваров группы', error);
    }
  }, [user?.id]);

  const computeEarlyCourseHighlight = useCallback(
    (plates: FlatOrderedPlate[]): FlatOrderedPlate[] => {
      const earliestPendingCourse = new Map<number, number>();
      for (const [orderId, allPlates] of allOrderPlates.entries()) {
        const pendingCourses = allPlates
          .filter(p => !isCourseDone(p.current_status))
          .map(p => p.course_number);
        if (pendingCourses.length === 0) continue;
        earliestPendingCourse.set(orderId, Math.min(...pendingCourses));
      }
      return plates.map(p => {
        const earliest = earliestPendingCourse.get(p.order_id);
        const orderPlates = allOrderPlates.get(p.order_id) ?? [];
        const courseNumbers = new Set(orderPlates.map(op => op.course_number));
        return {
          ...p,
          highlightedAsEarlyCourse:
            courseNumbers.size > 1 && earliest !== undefined && p.course_number === earliest,
        };
      });
    },
    [allOrderPlates]
  );

  const applyFilter = useCallback(
    async (
      source: FlatOrderedPlate[],
      statusF: StatusFilter,
      specF: SpecializationFilter,
      cookF: number | 'all' = 'all'
    ) => {
      let filtered = source.filter(item => item.current_status === statusF);

      if (statusF === 'waiting') {
        if (specF !== 'all') {
          filtered = filtered.filter(item => {
            const specs = plateToSpecializations.current.get(item.plate_id);
            return specs && specs.has(specF as number);
          });
        }
      } else {
        if (cookF !== 'all') {
          filtered = filtered.filter(item => item.cook_id_preparing === cookF);
        }
      }

      const withHighlight = computeEarlyCourseHighlight(filtered);
      const now = Date.now();
      const withWaiting = withHighlight.map(p => ({
        ...p,
        waitingMinutes: (now - new Date(p.timestart).getTime()) / 60_000,
      }));

      let withRecs: FlatOrderedPlate[];
      if (statusF === 'waiting') {
        try {
          const cooksForRecs = groupCooks.length > 0
            ? groupCooks
            : [{
                id: user!.id,
                name: user!.name,
                specialization: user!.specialization
              }];

          withRecs = await applyRecommendations(withWaiting, user?.id ?? 0, cooksForRecs);
        } catch {
          withRecs = withWaiting.map(p => ({ ...p, recommended: false }));
        }
      } else {
        withRecs = withWaiting.map(p => ({
          ...p,
          recommended: false,
          recommendedCookId: undefined,
          recommendedCookName: undefined,
          priorityScore: undefined,
        }));
      }

      const sorted = [...withRecs].sort((a, b) => {
        if (a.highlightedAsEarlyCourse !== b.highlightedAsEarlyCourse)
          return a.highlightedAsEarlyCourse ? -1 : 1;
        if (specF === 'all' || statusF !== 'waiting') {
          const waitDiff = (b.waitingMinutes ?? 0) - (a.waitingMinutes ?? 0);
          if (Math.abs(waitDiff) > 0.5) return waitDiff;
          return a.course_number - b.course_number;
        } else {
          if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
          if (a.course_number !== b.course_number) return a.course_number - b.course_number;
          return (a.priorityScore ?? Infinity) - (b.priorityScore ?? Infinity);
        }
      });

      setFilteredItems(sorted);
    },
    [user?.id, groupCooks, computeEarlyCourseHighlight]
  );

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

      const newAllOrderPlates = new Map<number, OrderPlate[]>();
      for (const order of orders) newAllOrderPlates.set(order.id, order.plates);
      setAllOrderPlates(newAllOrderPlates);

      const groupedMap = new Map<string, FlatOrderedPlate>();
      for (const order of orders) {
        for (const plate of order.plates) {
          if (!plate.is_considered) continue;
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
              cook_id_preparing: plate.cook_id_preparing ?? null,
            });
          }
        }
      }

      const flatList = Array.from(groupedMap.values());
      flatList.sort((a, b) => new Date(a.timestart).getTime() - new Date(b.timestart).getTime());
      setItems(flatList);
      await applyFilter(flatList, statusFilter, specializationFilter, cookFilter);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAllowedPlateIds, statusFilter, specializationFilter, cookFilter, applyFilter]);

  useEffect(() => {
    loadData();
    loadGroupCooks();
  }, []);

  useEffect(() => {
    clearSelection();
    if (statusFilter === 'waiting') {
      setCookFilter('all');
      applyFilter(items, statusFilter, specializationFilter, 'all');
    } else {
      applyFilter(items, statusFilter, specializationFilter, cookFilter);
    }
  }, [statusFilter, specializationFilter, items, applyFilter]);

  useEffect(() => {
    if (!canMultiSelect) clearSelection();
  }, [canMultiSelect]);

  useEffect(() => {
    applyFilter(items, statusFilter, specializationFilter, cookFilter);
  }, [cookFilter]);

  useEffect(() => {
    const interval = setInterval(() => { statsCacheRef.current.ts = 0; }, 5 * 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    clearSelection();
    loadData();
  }, [loadData]);

  const { addHandler } = useWebSocket();
  useEffect(() => {
    const unsubscribe = addHandler((data: any) => {
      if (
        data.type === 'new_order' ||
        data.type === 'plate_status_changed' ||
        data.type === 'order_updated' ||
        data.type === 'cooking_status_changed' ||
        data.type === 'cook_group_updated' ||
        data.type === 'spec_updated'
      ) {
        handleRefresh();
      }
    });
    return unsubscribe;
  }, [addHandler, handleRefresh]);

  const grouped = useMemo(() => {
    type CookSection = { cook: Cook; plates: FlatOrderedPlate[] };
    const cookSections = new Map<number, CookSection>();
    const unassigned: FlatOrderedPlate[] = [];
    const showSections = specializationFilter !== 'all' && statusFilter === 'waiting';

    if (!showSections) {
      filteredItems.forEach(item => unassigned.push(item));
      return { cookSections, unassigned };
    }

    const specId = specializationFilter as number;
    const eligibleCooks = groupCooks.filter(c => c.specialization?.id === specId);
    const MAX_PER_COOK = 4;
    const inAnySectionUids = new Set<string>();

    for (const cook of eligibleCooks) {
      const cookPlates = filteredItems
        .filter(item => {
          const specs = plateToSpecializations.current.get(item.plate_id);
          return specs && cook.specialization && specs.has(cook.specialization.id);
        })
        .slice(0, MAX_PER_COOK);
      if (cookPlates.length > 0) {
        cookSections.set(cook.id, { cook, plates: cookPlates });
        cookPlates.forEach(p => inAnySectionUids.add(p.uid));
      }
    }

    filteredItems.forEach(item => {
      if (!inAnySectionUids.has(item.uid)) unassigned.push(item);
    });

    return { cookSections, unassigned };
  }, [filteredItems, specializationFilter, statusFilter, groupCooks]);

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

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'waiting':   return { label: 'Ожидает',   color: '#f39c12' };
      case 'preparing': return { label: 'Готовится', color: '#3498db' };
      case 'ready':     return { label: 'Готово',    color: '#2ecc71' };
      case 'served':    return { label: 'Подано',    color: '#95a5a6' };
      case 'cancelled': return { label: 'Отменено', color: '#e74c3c' };
      default:          return { label: status,      color: '#7f8c8d' };
    }
  };

  const changePlateStatusAuto = async (nextStatus: string, cookId: number) => {
    try {
      await api.put(
        `/orders/plate/${selectedItem?.plate_order_id}/status/${nextStatus}?change_by=${cookId}`
      );
      setDetailModalVisible(false);
      loadData();
    } catch (error: any) {
      const msg =
        error.response?.status === 409
          ? 'Этот статус уже установлен другим поваром'
          : error.response?.data?.detail || error.message || 'Не удалось изменить статус';
      Alert.alert('Ошибка', msg);
      loadData();
    }
  };

  const openChangeStatus = (nextStatus: string) => {
    setTargetStatus(nextStatus);
    if (nextStatus === 'ready') {
      const cookId = selectedItem?.cook_id_preparing;
      if (!cookId) return;
      changePlateStatusAuto(nextStatus, cookId);
      return;
    }
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
      await api.put(
        `/orders/plate/${selectedItem.plate_order_id}/status/${targetStatus}?change_by=${selectedCookId}`
      );
      setChangeStatusModalVisible(false);
      setDetailModalVisible(false);
      loadData();
      Alert.alert('Успех', `Статус изменён на "${getStatusLabel(targetStatus)}"`);
    } catch (error: any) {
      const msg =
        error.response?.status === 409
          ? 'Этот статус уже установлен другим поваром'
          : error.response?.data?.detail || error.message || 'Не удалось изменить статус';
      Alert.alert('Ошибка', msg);
      setChangeStatusModalVisible(false);
      setDetailModalVisible(false);
      loadData();
    } finally {
      setLoadingChange(false);
    }
  };

  const rollbackStatus = async (plateOrderId: number, expectedCurrentStatus: string) => {
    setLoadingRollback(true);
    try {
      await api.delete(`/cooking-status-history/rollback/${plateOrderId}`, {
        params: { expected_current_status: expectedCurrentStatus },
      });
      Alert.alert('Успешно', 'Статус откачен');
      setDetailModalVisible(false);
      loadData();
    } catch (error: any) {
      const msg =
        error.response?.status === 409
          ? 'Статус уже изменен другим поваром'
          : error.response?.data?.detail || error.message || 'Не удалось откатить статус';
      Alert.alert('Ошибка', msg);
      setDetailModalVisible(false);
      loadData();
    } finally {
      setLoadingRollback(false);
    }
  };

  const renderSliderCard = (item: FlatOrderedPlate, isCurrentCook: boolean) => (
    <TouchableOpacity
      key={item.uid}
      style={[styles.recommendedCard]}
      onPress={() => handleCardPress(item)}
    >
      <Text style={styles.recPlateName} numberOfLines={1}>{item.plate_name}</Text>
      <Text style={styles.recCount}>x{item.count}</Text>
      {item.highlightedAsEarlyCourse && (
        <Ionicons name="timer-outline" size={14} color="#e67e22" />
      )}
    </TouchableOpacity>
  );

  const swipeableRefs = useRef(new Map()).current;

  const renderItem = ({ item }: { item: FlatOrderedPlate }) => {
    const statusInfo = getStatusInfo(item.current_status);
    const isSelected = selectedUids.has(item.uid);
    const cookName = item.cook_id_preparing
      ? groupCooks.find(c => c.id === item.cook_id_preparing)?.name
      : null;

    const renderRightActions = () => (
      <RectButton
        style={{
          backgroundColor: isSelected ? '#e74c3c' : '#3498db',
          justifyContent: 'center',
          alignItems: 'center',
          width: 72,
          marginBottom: 12,
          borderRadius: 12,
        }}
        onPress={() => {
          swipeableRefs.get(item.uid)?.close();
          toggleSelectItem(item);
        }}
      >
        <Ionicons
          name={isSelected ? 'close-circle-outline' : 'checkmark-circle-outline'}
          size={28}
          color="#fff"
        />
      </RectButton>
    );

    const cardContent = (
      <TouchableOpacity onPress={() => handleCardPress(item)} activeOpacity={0.75}>
          <View style={[styles.card, isSelected && { borderColor: '#3498db', borderWidth: 2 }]}>
            {item.highlightedAsEarlyCourse && <View style={styles.earlyCourseIndicator} />}

            <View style={styles.cardHeader}>
              <Text style={styles.plateName}>{item.plate_name}</Text>
              <Text style={styles.count}>x{item.count}</Text>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.orderInfo}></Text>
              {cookName && <Text style={styles.cookName}>{cookName}</Text>}
            </View>

            <View style={styles.bottomRow}>
              <Text style={styles.time}>
                {new Date(item.timestart).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                <Text style={styles.statusText}>{statusInfo.label}</Text>
              </View>
            </View>

            {item.comments.length > 0 && (
              <Text style={styles.cardComment} numberOfLines={2}>
                💬 {item.comments.join(' · ')}
              </Text>
            )}

            {item.highlightedAsEarlyCourse && (
              <Text style={styles.earlyCourseLabel}>Повышенный приоритет</Text>
            )}
          </View>
      </TouchableOpacity>
    );

    if (!canMultiSelect) return cardContent;

    return (
      <Swipeable
        ref={ref => { if (ref) swipeableRefs.set(item.uid, ref); else swipeableRefs.delete(item.uid); }}
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        {cardContent}
      </Swipeable>
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
  const bulkNextStatus = statusFilter === 'waiting'
    ? 'preparing'
    : statusFilter === 'preparing'
    ? 'ready'
    : null;
  const bulkNextLabel = bulkNextStatus === 'preparing'
    ? 'Взять в работу'
    : bulkNextStatus === 'ready'
    ? 'Завершить приготовление'
    : null;

  const showCookFilterBar =
    (statusFilter === 'preparing' || statusFilter === 'ready') && groupCooks.length > 1;

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

      {statusFilter === 'waiting' && availableSpecializations.length > 1 && (
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

      {showCookFilterBar && (
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {renderFilterChip('all', 'Все повара', cookFilter, setCookFilter, '#9b59b6')}
            {groupCooks.map(cook => (
              <React.Fragment key={cook.id}>
                {renderFilterChip(
                  cook.id,
                  cook.id === user?.id ? `${cook.name}` : cook.name,
                  cookFilter,
                  setCookFilter,
                  '#9b59b6'
                )}
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={grouped.unassigned}
        renderItem={renderItem}
        keyExtractor={item => item.uid}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#FF6B6B']} />
        }
        ListHeaderComponent={() => (
          <View>
            {statusFilter === 'waiting' &&
              specializationFilter !== 'all' &&
              Array.from(grouped.cookSections.entries()).map(([cookId, { cook, plates }]) => (
                <View key={cookId} style={styles.recommendedSection}>
                  <Text style={styles.sectionTitle}>{cook.name}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 12 }}
                  >
                    {plates.map(item => renderSliderCard(item, cookId === user?.id))}
                  </ScrollView>
                </View>
              ))}
          </View>
        )}
        ListEmptyComponent={
          grouped.cookSections.size === 0 ? (
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
                {selectedItem?.current_status === 'waiting' && (
                  <TouchableOpacity
                    style={[styles.changeStatusButton, { backgroundColor: '#e74c3c', marginTop: 8 }]}
                    onPress={async () => {
                      const cookId = user?.id;
                      if (!cookId) return;
                      try {
                        await api.put(
                          `/orders/plate/${selectedItem.plate_order_id}/status/cancelled?change_by=${cookId}`
                        );
                        setDetailModalVisible(false);
                        loadData();
                      } catch (error: any) {
                        Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось отменить блюдо');
                      }
                    }}
                  >
                    <Text style={styles.changeStatusButtonText}>Невозможно приготовить</Text>
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
            {targetStatus === 'ready' ? (
              <View style={{ paddingVertical: 10 }}>
                <Text style={{ fontSize: 16, marginBottom: 6 }}>Повар:</Text>
                <Text style={{ fontSize: 18, fontWeight: '600' }}>
                  {groupCooks.find(c => c.id === selectedCookId)?.name ?? 'Не найден'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={groupCooks.filter(cook => {
                  if (!selectedItem) return false;
                  const allowedSpecs = plateToSpecializations.current.get(selectedItem.plate_id);
                  if (!allowedSpecs) return false;
                  return cook.specialization ? allowedSpecs.has(cook.specialization.id) : false;
                })}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.cookItem, selectedCookId === item.id && styles.cookItemSelected]}
                    onPress={() => setSelectedCookId(item.id)}
                  >
                    <Text style={styles.cookName}>{item.name}</Text>
                    {item.specialization && <Text style={styles.cookSpec}>{item.specialization.name}</Text>}
                    {selectedCookId === item.id && <Ionicons name="checkmark-circle" size={20} color="#2ecc71" />}
                  </TouchableOpacity>
                )}
              />
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setChangeStatusModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={changePlateStatus} disabled={!selectedCookId}>
                <Text style={styles.confirmButtonText}>Подтвердить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={bulkListModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Выбрано: {selectedItems.length}</Text>
              <TouchableOpacity onPress={() => setBulkListModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={selectedItems}
              keyExtractor={item => item.uid}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const statusInfo = getStatusInfo(item.current_status);
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                    <TouchableOpacity
                      onPress={() => toggleSelectItem(item)}
                      style={{ marginRight: 10 }}
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#e74c3c" />
                    </TouchableOpacity>
                    <Text style={{ flex: 1, fontSize: 15 }}>{item.plate_name}</Text>
                    <Text style={{ marginRight: 8, color: '#888' }}>x{item.count}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                      <Text style={styles.statusText}>{statusInfo.label}</Text>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={
                <TouchableOpacity
                  onPress={() => { setBulkListModalVisible(false); clearSelection(); }}
                  style={{ paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={{ color: '#e74c3c', fontSize: 14 }}>Снять выделение</Text>
                </TouchableOpacity>
              }
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {(statusFilter === 'preparing' || statusFilter === 'ready') && (
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: '#e74c3c', flex: 1 }]}
                  onPress={() => {
                    setBulkListModalVisible(false);
                    confirmBulkRollback();
                  }}
                >
                  <Text style={styles.confirmButtonText}>Откатить статус</Text>
                </TouchableOpacity>
              )}
              {bulkNextLabel && bulkNextStatus && (
                <TouchableOpacity
                  style={[styles.confirmButton, { flex: 1 }]}
                  onPress={() => {
                    setBulkListModalVisible(false);
                    openBulkStatusChange(bulkNextStatus);
                  }}
                >
                  <Text style={[styles.confirmButtonText, { textAlign: 'center' }]}>{bulkNextLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={bulkStatusModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Кто выполняет? ({selectedUids.size} блюд)
            </Text>
            {bulkTargetStatus !== 'ready' && (
              <FlatList
                data={bulkEligibleCooks}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.cookItem, bulkSelectedCookId === item.id && styles.cookItemSelected]}
                    onPress={() => setBulkSelectedCookId(item.id)}
                  >
                    <Text style={styles.cookName}>{item.name}</Text>
                    {item.specialization && <Text style={styles.cookSpec}>{item.specialization.name}</Text>}
                    {bulkSelectedCookId === item.id && <Ionicons name="checkmark-circle" size={20} color="#2ecc71" />}
                  </TouchableOpacity>
                )}
              />
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setBulkStatusModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, bulkLoadingChange && { opacity: 0.6 }]}
                onPress={confirmBulkStatusChange}
                disabled={bulkLoadingChange || (bulkTargetStatus !== 'ready' && !bulkSelectedCookId)}
              >
                {bulkLoadingChange
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmButtonText}>Подтвердить</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ChefOrders;