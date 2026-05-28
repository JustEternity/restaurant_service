import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/AdminStaffStyles';

interface User {
  id: number;
  name: string;
  login: string;
  role: string;
  is_available: boolean;
  specialization?: Specialization | null;
}

interface EditUserData {
  name: string;
  login: string;
  password: string;
  role: string;
  is_available: boolean;
  specialization_id: number | null;
  _showSpecSelector?: boolean;
}

interface Specialization {
  id: number;
  name: string;
}

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category?: number | null;
  category_name?: string;
}

interface CategoryNode {
  id: number;
  name: string;
  parent_category: number | null;
  children: CategoryNode[];
}

type ActiveFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | 'cook' | 'waiter';

const AdminStaff = () => {
  const { user } = useAuth();
  const navigation = useNavigation();

  const [staff, setStaff] = useState<User[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [editData, setEditData] = useState<EditUserData>({
    name: '',
    login: '',
    password: '',
    role: 'waiter',
    is_available: true,
    specialization_id: null,
  });
  const [allSpecializations, setAllSpecializations] = useState<Specialization[]>([]);

  const [specModalVisible, setSpecModalVisible] = useState(false);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [specLoading, setSpecLoading] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');
  const [mode, setMode] = useState<'list' | 'plates'>('list');
  const [selectedSpec, setSelectedSpec] = useState<Specialization | null>(null);
  const [linkedPlates, setLinkedPlates] = useState<MenuItem[]>([]);
  const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([]);
  const [platesLoading, setPlatesLoading] = useState(false);
  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const handleManageGroups = () => navigation.navigate('CookGroupManagement');

  const loadAllSpecializations = async () => {
    try {
      const res = await api.get('/specializations/');
      setAllSpecializations(res.data);
      setSpecializations(res.data);
    } catch (error) {
      console.error('Ошибка загрузки специализаций', error);
    }
  };

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/users/');
      const data: User[] = response.data;
      const nonAdminUsers = data.filter((u) => u.role !== 'admin');
      setStaff(nonAdminUsers);
      applyFilters(nonAdminUsers);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить список сотрудников');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
    loadAllSpecializations();
  }, [loadStaff]);

  const applyFilters = (userList: User[] = staff) => {
    let filtered = userList;
    if (roleFilter !== 'all') filtered = filtered.filter((u) => u.role === roleFilter);
    if (activeFilter !== 'all') {
      const isActive = activeFilter === 'active';
      filtered = filtered.filter((u) => u.is_available === isActive);
    }
    filtered.sort((a, b) => {
      if (a.is_available !== b.is_available) return b.is_available ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    setFilteredStaff(filtered);
  };

  useEffect(() => {
    applyFilters();
  }, [activeFilter, roleFilter, staff]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadStaff();
  };

  const handleUserPress = (u: User) => { setSelectedUser(u); setModalVisible(true); };
  const handleEditUser = (u: User) => {
    setSelectedUser(u);
    setEditData({
      name: u.name,
      login: u.login,
      password: '',
      role: u.role,
      is_available: u.is_available,
      specialization_id: u.specialization?.id ?? null,
      _showSpecSelector: false,
    });
    setEditModalVisible(true);
  };

  const handleDeleteUser = (u: User) => {
    Alert.alert('Удаление сотрудника', `Вы уверены, что хотите удалить сотрудника ${u.name}?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteUser(u.id) },
    ]);
  };

  const deleteUser = async (userId: number) => {
    try {
      await api.delete(`/users/${userId}`);
      setStaff((prev) => prev.filter((u) => u.id !== userId));
      Alert.alert('Успех', 'Сотрудник удалён');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось удалить сотрудника');
    }
  };

  const handleSaveUser = async () => {
    if (!editData.name.trim() || !editData.login.trim()) {
      Alert.alert('Ошибка', 'Имя и логин обязательны');
      return;
    }
    try {
      const updateData: any = {
        name: editData.name,
        login: editData.login,
        role: editData.role,
        is_available: editData.is_available,
        specialization_id: editData.role === 'cook' ? editData.specialization_id : null,
      };
      if (editData.password.trim()) updateData.password = editData.password;
      const response = await api.put(`/users/${selectedUser?.id}`, updateData);
      const updatedUser: User = response.data;
      setStaff((prev) => prev.map((u) => (u.id === selectedUser?.id ? updatedUser : u)));
      setEditModalVisible(false);
      Alert.alert('Успех', 'Данные сотрудника обновлены');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить данные сотрудника');
    }
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setEditData({
      name: '',
      login: '',
      password: '',
      role: 'waiter',
      is_available: true,
      specialization_id: null,
      _showSpecSelector: false,
    });
    setEditModalVisible(true);
  };

  const handleCreateUser = async () => {
    if (!editData.name.trim() || !editData.login.trim() || !editData.password.trim()) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля');
      return;
    }
    try {
      const body = {
        name: editData.name,
        login: editData.login,
        password: editData.password,
        role: editData.role,
        is_available: editData.is_available,
        specialization_id: editData.role === 'cook' ? editData.specialization_id : null,
      };
      const response = await api.post('/users/', body);
      const newUser: User = response.data;
      setStaff((prev) => [...prev, newUser]);
      setEditModalVisible(false);
      Alert.alert('Успех', 'Сотрудник добавлен');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось добавить сотрудника');
    }
  };

  const loadSpecializations = async () => {
    setSpecLoading(true);
    try {
      const res = await api.get('/specializations/');
      setSpecializations(res.data);
      setAllSpecializations(res.data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить специализации');
    } finally {
      setSpecLoading(false);
    }
  };

  const handleOpenSpecModal = () => {
    setMode('list');
    setSpecModalVisible(true);
    loadSpecializations();
    api.get('/menu/').then(res => setAllMenuItems(res.data)).catch(() => {});
    api.get('/menu/categories/tree').then(res => setCategoriesTree(res.data)).catch(() => {});
  };

  const handleCreateSpec = async () => {
    if (!newSpecName.trim()) return;
    try {
      const res = await api.post('/specializations/', { name: newSpecName });
      const newSpec = res.data;
      setSpecializations((prev) => [...prev, newSpec]);
      setAllSpecializations((prev) => [...prev, newSpec]);
      setNewSpecName('');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать специализацию');
    }
  };

  const handleDeleteSpec = (id: number) => {
    Alert.alert('Удалить', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/specializations/${id}`);
            setSpecializations((prev) => prev.filter((s) => s.id !== id));
            setAllSpecializations((prev) => prev.filter((s) => s.id !== id));
          } catch (error) {
            Alert.alert('Ошибка', 'Не удалось удалить');
          }
        },
      },
    ]);
  };

  const openPlatesForSpec = async (spec: Specialization) => {
    setSelectedSpec(spec);
    setMode('plates');
    setPlatesLoading(true);
    try {
      const [menuRes, treeRes, linkedRes] = await Promise.all([
        api.get('/menu/'),
        api.get('/menu/categories/tree'),
        api.get(`/plates-specializations/specialization/${spec.id}`)
      ]);
      setAllMenuItems(menuRes.data);
      setCategoriesTree(Array.isArray(treeRes.data) ? treeRes.data : []);
      const linkedData: any[] = linkedRes.data;
      const plates: MenuItem[] = linkedData.map((link) => ({
        id: link.plate_id,
        name: link.plate_name,
        description: '',
        price: 0,
      }));
      setLinkedPlates(plates);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить данные');
    } finally {
      setPlatesLoading(false);
    }
  };

  const linkedPlatesIds = useMemo(() => new Set(linkedPlates.map(p => p.id)), [linkedPlates]);

  const categoryPlatesMap = useMemo(() => {
    const map = new Map<number, MenuItem[]>();
    const byCategory = new Map<number, MenuItem[]>();
    allMenuItems.forEach(item => {
      if (item.category != null) {
        if (!byCategory.has(item.category)) byCategory.set(item.category, []);
        byCategory.get(item.category)!.push(item);
      }
    });

    const collect = (node: CategoryNode): MenuItem[] => {
      let plates: MenuItem[] = [];
      if (byCategory.has(node.id)) plates.push(...byCategory.get(node.id)!);
      for (const child of node.children) {
        plates.push(...collect(child));
      }
      map.set(node.id, plates);
      return plates;
    };

    categoriesTree.forEach(root => collect(root));
    return map;
  }, [allMenuItems, categoriesTree]);

  const addPlatesToSpec = async (plateIds: number[]) => {
    if (!selectedSpec) return;
    for (const plateId of plateIds) {
      try {
        await api.post('/plates-specializations/', {
          plate_id: plateId,
          specialization_id: selectedSpec.id,
        });
      } catch (e) {
      }
    }
    const newLinked = allMenuItems.filter(m => plateIds.includes(m.id) || linkedPlatesIds.has(m.id));
    setLinkedPlates(newLinked);
  };

  const removePlatesFromSpec = async (plateIds: number[]) => {
    if (!selectedSpec) return;
    try {
      const res = await api.get(`/plates-specializations/specialization/${selectedSpec.id}`);
      const links: any[] = res.data;
      const toDelete = links
        .filter((l: any) => plateIds.includes(l.plate_id))
        .map((l: any) => l.id);
      for (const linkId of toDelete) {
        await api.delete(`/plates-specializations/${linkId}`);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось удалить некоторые связи');
    }
    setLinkedPlates(prev => prev.filter(p => !plateIds.includes(p.id)));
  };

  const handleToggleCategory = async (node: CategoryNode, currentlyChecked: boolean) => {
    const plates = categoryPlatesMap.get(node.id) || [];
    if (plates.length === 0) return;

    if (currentlyChecked) {
      const idsToRemove = plates.filter(p => linkedPlatesIds.has(p.id)).map(p => p.id);
      if (idsToRemove.length > 0) {
        await removePlatesFromSpec(idsToRemove);
      }
    } else {
      const idsToAdd = plates.filter(p => !linkedPlatesIds.has(p.id)).map(p => p.id);
      if (idsToAdd.length > 0) {
        await addPlatesToSpec(idsToAdd);
      }
    }
  };

  const toggleExpandCategory = (id: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCategoryNode = (node: CategoryNode, depth: number) => {
    const ownPlates = allMenuItems.filter(item => item.category === node.id);

    const allSubPlates = categoryPlatesMap.get(node.id) || [];
    const allChecked = allSubPlates.length > 0 && allSubPlates.every(p => linkedPlatesIds.has(p.id));
    const someChecked = allSubPlates.some(p => linkedPlatesIds.has(p.id));
    const indeterminate = !allChecked && someChecked;

    const isExpanded = expandedCategories.has(node.id);
    const hasChildren = node.children.length > 0 || ownPlates.length > 0;

    return (
      <View key={node.id}>
        <View style={[styles.categoryRow, { paddingLeft: 16 + depth * 20 }]}>
          <TouchableOpacity onPress={() => handleToggleCategory(node, allChecked)} style={styles.checkbox}>
            <Ionicons
              name={allChecked ? 'checkbox' : indeterminate ? 'remove-circle' : 'square-outline'}
              size={24}
              color={allChecked ? '#2ecc71' : indeterminate ? '#f39c12' : '#aaa'}
            />
          </TouchableOpacity>
          {hasChildren ? (
            <TouchableOpacity onPress={() => toggleExpandCategory(node.id)} style={styles.expandButton}>
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 28 }} />
          )}
          <Text style={styles.categoryName}>{node.name}</Text>
          <Text style={styles.plateCount}>({allSubPlates.length})</Text>
        </View>

        {isExpanded && (
          <View>
            {ownPlates.map(plate => {
              const isLinked = linkedPlatesIds.has(plate.id);
              return (
                <View key={plate.id} style={[styles.plateRow, { paddingLeft: 16 + (depth + 1) * 20 }]}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={async () => {
                      if (isLinked) {
                        await removePlatesFromSpec([plate.id]);
                      } else {
                        await addPlatesToSpec([plate.id]);
                      }
                    }}
                  >
                    <Ionicons
                      name={isLinked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isLinked ? '#2ecc71' : '#aaa'}
                    />
                  </TouchableOpacity>
                  <Text style={styles.plateName}>{plate.name}</Text>
                </View>
              );
            })}
            {node.children.map(child => renderCategoryNode(child, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  const closeSpecModal = () => {
    setSpecModalVisible(false);
    setMode('list');
    setSelectedSpec(null);
    setLinkedPlates([]);
    setExpandedCategories(new Set());
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.userItem, !item.is_available && styles.userItemInactive]}
      onPress={() => handleUserPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text style={styles.userName}>{item.name}</Text>
          <View style={[styles.roleBadge, item.role === 'cook' ? styles.cookBadge : styles.waiterBadge]}>
            <Text style={styles.roleText}>{item.role === 'cook' ? 'Повар' : 'Официант'}</Text>
          </View>
        </View>
        <View style={styles.userDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.userLogin}>{item.login}</Text>
          </View>
          {item.role === 'cook' && item.specialization && (
            <View style={styles.detailRow}>
              <Ionicons name="ribbon-outline" size={16} color="#666" />
              <Text style={styles.specializationText}>{item.specialization.name}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Ionicons
              name={item.is_available ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={item.is_available ? '#2ecc71' : '#e74c3c'}
            />
            <Text style={[styles.statusText, { color: item.is_available ? '#2ecc71' : '#e74c3c' }]}>
              {item.is_available ? 'Активен' : 'Неактивен'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleEditUser(item)}>
          <Ionicons name="create-outline" size={22} color="#3498db" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleDeleteUser(item)}>
          <Ionicons name="trash-outline" size={22} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка сотрудников...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{filteredStaff.length} сотрудников</Text>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={handleOpenSpecModal} style={styles.groupsButton}>
              <Ionicons name="ribbon-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleManageGroups} style={styles.groupsButton}>
              <Ionicons name="people-circle-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Роль:</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[styles.filterButton, roleFilter === 'all' && styles.filterButtonActive]}
                onPress={() => setRoleFilter('all')}
              >
                <Text style={[styles.filterButtonText, roleFilter === 'all' && styles.filterButtonTextActive]}>
                  Все
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, roleFilter === 'cook' && styles.filterButtonActive]}
                onPress={() => setRoleFilter('cook')}
              >
                <Text style={[styles.filterButtonText, roleFilter === 'cook' && styles.filterButtonTextActive]}>
                  Повара
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, roleFilter === 'waiter' && styles.filterButtonActive]}
                onPress={() => setRoleFilter('waiter')}
              >
                <Text style={[styles.filterButtonText, roleFilter === 'waiter' && styles.filterButtonTextActive]}>
                  Официанты
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Статус:</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[styles.filterButton, activeFilter === 'all' && styles.filterButtonActive]}
                onPress={() => setActiveFilter('all')}
              >
                <Text style={[styles.filterButtonText, activeFilter === 'all' && styles.filterButtonTextActive]}>
                  Все
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, activeFilter === 'active' && styles.filterButtonActive]}
                onPress={() => setActiveFilter('active')}
              >
                <Text style={[styles.filterButtonText, activeFilter === 'active' && styles.filterButtonTextActive]}>
                  Активные
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, activeFilter === 'inactive' && styles.filterButtonActive]}
                onPress={() => setActiveFilter('inactive')}
              >
                <Text style={[styles.filterButtonText, activeFilter === 'inactive' && styles.filterButtonTextActive]}>
                  Неактивные
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      <FlatList
        data={filteredStaff}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} />}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>
              {staff.length === 0 ? 'Нет сотрудников' : 'Нет сотрудников по выбранным фильтрам'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.addButton} onPress={handleAddUser} activeOpacity={0.8}>
        <View style={styles.addButtonInner}>
          <Ionicons name="add" size={28} color="#fff" />
        </View>
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            {selectedUser && (
              <ScrollView style={styles.modalScrollView}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalName}>{selectedUser.name}</Text>
                  <View style={[styles.roleBadge, selectedUser.role === 'cook' ? styles.cookBadge : styles.waiterBadge]}>
                    <Text style={styles.roleText}>{selectedUser.role === 'cook' ? 'Повар' : 'Официант'}</Text>
                  </View>
                </View>
                <View style={styles.modalDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons name="person-outline" size={18} color="#666" />
                    <Text style={styles.detailLabel}>Логин:</Text>
                    <Text style={styles.detailValue}>{selectedUser.login}</Text>
                  </View>
                  {selectedUser.role === 'cook' && selectedUser.specialization && (
                    <View style={styles.detailItem}>
                      <Ionicons name="ribbon-outline" size={18} color="#666" />
                      <Text style={styles.detailLabel}>Специализация:</Text>
                      <Text style={styles.detailValue}>{selectedUser.specialization.name}</Text>
                    </View>
                  )}
                  <View style={styles.detailItem}>
                    <Ionicons
                      name={selectedUser.is_available ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={selectedUser.is_available ? '#2ecc71' : '#e74c3c'}
                    />
                    <Text style={styles.detailLabel}>Статус:</Text>
                    <Text style={[styles.detailValue, { color: selectedUser.is_available ? '#2ecc71' : '#e74c3c' }]}>
                      {selectedUser.is_available ? 'Активен' : 'Неактивен'}
                    </Text>
                  </View>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.editButton]}
                    onPress={() => { setModalVisible(false); handleEditUser(selectedUser); }}
                  >
                    <Ionicons name="create-outline" size={20} color="#fff" />
                    <Text style={styles.modalActionButtonText}>Редактировать</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.deleteButton]}
                    onPress={() => { setModalVisible(false); handleDeleteUser(selectedUser); }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                    <Text style={styles.modalActionButtonText}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>{selectedUser ? 'Редактировать' : 'Добавить'} сотрудника</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.editModalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Имя *</Text>
                <TextInput
                  style={styles.input}
                  value={editData.name}
                  onChangeText={(t) => setEditData({ ...editData, name: t })}
                  placeholder="Введите имя"
                  placeholderTextColor= "#888787"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Логин *</Text>
                <TextInput
                  style={styles.input}
                  value={editData.login}
                  onChangeText={(t) => setEditData({ ...editData, login: t })}
                  placeholder="Введите логин"
                  placeholderTextColor= "#888787"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Пароль {selectedUser ? '(оставьте пустым)' : '*'}</Text>
                <TextInput
                  style={styles.input}
                  value={editData.password}
                  onChangeText={(t) => setEditData({ ...editData, password: t })}
                  placeholder="Введите пароль"
                  placeholderTextColor= "#888787"
                  secureTextEntry
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Роль</Text>
                <View style={styles.roleButtons}>
                  <TouchableOpacity
                    style={[styles.roleButton, editData.role === 'waiter' && styles.roleButtonActive]}
                    onPress={() => setEditData({ ...editData, role: 'waiter', specialization_id: null, _showSpecSelector: false })}
                  >
                    <Ionicons name="restaurant-outline" size={20} color={editData.role === 'waiter' ? '#fff' : '#666'} />
                    <Text style={[styles.roleButtonText, editData.role === 'waiter' && styles.roleButtonTextActive]}>
                      Официант
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleButton, editData.role === 'cook' && styles.roleButtonActive]}
                    onPress={() => setEditData({ ...editData, role: 'cook' })}
                  >
                    <Ionicons name="flame-outline" size={20} color={editData.role === 'cook' ? '#fff' : '#666'} />
                    <Text style={[styles.roleButtonText, editData.role === 'cook' && styles.roleButtonTextActive]}>
                      Повар
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {editData.role === 'cook' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Специализация</Text>
                  <TouchableOpacity
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      backgroundColor: '#f9f9f9',
                    }}
                    onPress={() => setEditData({ ...editData, _showSpecSelector: !editData._showSpecSelector })}
                  >
                    <Text style={{ color: editData.specialization_id ? '#333' : '#999' }}>
                      {editData.specialization_id
                        ? allSpecializations.find(s => s.id === editData.specialization_id)?.name || 'Не найдена'
                        : 'Без специализации'}
                    </Text>
                  </TouchableOpacity>
                  {editData._showSpecSelector && (
                    <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, overflow: 'hidden' }}>
                      <ScrollView
                        style={{ maxHeight: 180 }}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        <TouchableOpacity
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                          onPress={() => setEditData({ ...editData, specialization_id: null, _showSpecSelector: false })}
                        >
                          <Text style={{ color: editData.specialization_id === null ? '#007AFF' : '#333' }}>
                            Без специализации
                          </Text>
                        </TouchableOpacity>
                        {allSpecializations.map(spec => (
                          <TouchableOpacity
                            key={spec.id}
                            style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                            onPress={() => setEditData({ ...editData, specialization_id: spec.id, _showSpecSelector: false })}
                          >
                            <Text style={{ color: editData.specialization_id === spec.id ? '#007AFF' : '#333' }}>
                              {spec.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
              <View style={styles.switchGroup}>
                <Text style={styles.inputLabel}>Активен</Text>
                <Switch
                  value={editData.is_available}
                  onValueChange={(v) => setEditData({ ...editData, is_available: v })}
                  trackColor={{ false: '#ddd', true: '#2ecc71' }}
                  thumbColor={editData.is_available ? '#fff' : '#f4f3f4'}
                />
              </View>
            </ScrollView>
            <View style={styles.editModalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={selectedUser ? handleSaveUser : handleCreateUser}>
                <Text style={styles.saveButtonText}>{selectedUser ? 'Сохранить' : 'Добавить'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={specModalVisible} animationType="slide" transparent onRequestClose={closeSpecModal}>
        <View style={mode === 'list' ? styles.modalOverlayCenter : styles.modalOverlayBottom}>
          <View style={mode === 'list' ? styles.modalContentList : styles.modalContentPlates}>
            {mode === 'list' ? (
              <>
                <View style={styles.modalHeaderSpecs}>
                  <Text style={styles.modalTitle}>Специализации</Text>
                  <TouchableOpacity onPress={closeSpecModal}>
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                <View style={styles.specInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Название специализации"
                    placeholderTextColor= "#888787"
                    value={newSpecName}
                    onChangeText={setNewSpecName}
                  />
                  <TouchableOpacity style={styles.addButtonSmall} onPress={handleCreateSpec}>
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
                {specLoading ? (
                  <ActivityIndicator style={{ margin: 20 }} />
                ) : (
                  <FlatList
                    data={specializations}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                      <View style={styles.specItem}>
                        <Text style={styles.specName}>{item.name}</Text>
                        <View style={{ flexDirection: 'row' }}>
                          <TouchableOpacity onPress={() => openPlatesForSpec(item)} style={{ marginRight: 15 }}>
                            <Ionicons name="list-outline" size={22} color="#3498db" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteSpec(item.id)}>
                            <Ionicons name="trash-outline" size={22} color="#e74c3c" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  />
                )}
              </>
            ) : (
              <>
                <View style={styles.modalHeaderSpecs}>
                  <TouchableOpacity onPress={() => setMode('list')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#007AFF" />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>{selectedSpec?.name}</Text>
                  <TouchableOpacity onPress={closeSpecModal}>
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                {platesLoading ? (
                  <ActivityIndicator style={{ margin: 20 }} />
                ) : categoriesTree.length === 0 && allMenuItems.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyText}>Нет данных меню и категорий</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { marginLeft: 16, marginTop: 8 }]}>Выберите категории</Text>
                    {categoriesTree.map((root) => renderCategoryNode(root, 0))}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default AdminStaff;