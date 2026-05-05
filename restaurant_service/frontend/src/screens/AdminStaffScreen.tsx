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
  TextInput,
  ScrollView,
  Switch,
  Dimensions,
} from 'react-native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

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
}

type ActiveFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | 'cook' | 'waiter';

const AdminStaff = () => {
  const { authToken, user } = useAuth();
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

  const handleManageGroups = () => navigation.navigate('CookGroupManagement');

  const loadAllSpecializations = async () => {
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/specializations/`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllSpecializations(data);
        setSpecializations(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки специализаций', error);
    }
  };

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/users/`, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: User[] = await response.json();
      const nonAdminUsers = data.filter((u) => u.role !== 'admin');
      setStaff(nonAdminUsers);
      applyFilters(nonAdminUsers);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить список сотрудников');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken]);

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

  const handleUserPress = (u: User) => {
    setSelectedUser(u);
    setModalVisible(true);
  };

  const handleEditUser = (u: User) => {
    setSelectedUser(u);
    setEditData({
      name: u.name,
      login: u.login,
      password: '',
      role: u.role,
      is_available: u.is_available,
      specialization_id: u.specialization?.id ?? null,
    });
    setEditModalVisible(true);
  };

  const handleDeleteUser = (u: User) => {
    Alert.alert('Удаление сотрудника', `Вы уверены, что хотите удалить сотрудника ${u.name}?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => deleteUser(u.id),
      },
    ]);
  };

  const deleteUser = async (userId: number) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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

      const response = await fetch(`${API_CONFIG.BASE_URL}/users/${selectedUser?.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) throw new Error('Ошибка сохранения');
      const updatedUser: User = await response.json();
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
    });
    setEditModalVisible(true);
  };

  const handleCreateUser = async () => {
    if (!editData.name.trim() || !editData.login.trim() || !editData.password.trim()) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля');
      return;
    }
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/users/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: editData.name,
          login: editData.login,
          password: editData.password,
          role: editData.role,
          is_available: editData.is_available,
          specialization_id: editData.role === 'cook' ? editData.specialization_id : null,
        }),
      });
      if (!response.ok) throw new Error('Ошибка создания');
      const newUser: User = await response.json();
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
      const res = await fetch(`${API_CONFIG.BASE_URL}/specializations/`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      setSpecializations(data);
      setAllSpecializations(data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить специализации');
    } finally {
      setSpecLoading(false);
    }
  };

  const loadAllMenuItems = async () => {
    if (allMenuItems.length > 0) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/menu/`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Ошибка загрузки меню');
      const data = await res.json();
      setAllMenuItems(data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить меню');
    }
  };

  const handleOpenSpecModal = () => {
    setMode('list');
    setSpecModalVisible(true);
    loadSpecializations();
    loadAllMenuItems();
  };

  const handleCreateSpec = async () => {
    if (!newSpecName.trim()) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/specializations/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newSpecName }),
      });
      if (!res.ok) throw new Error('Ошибка создания');
      const newSpec = await res.json();
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
            await fetch(`${API_CONFIG.BASE_URL}/specializations/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${authToken}` },
            });
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
      const res = await fetch(`${API_CONFIG.BASE_URL}/plates-specializations/specialization/${spec.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const linkedData = await res.json();
        const plates = linkedData.map((link: any) => ({
          id: link.plate_id,
          name: link.plate_name,
          description: '',
          price: 0,
        }));
        setLinkedPlates(plates);
      } else {
        setLinkedPlates([]);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить связанные блюда');
    } finally {
      setPlatesLoading(false);
    }
  };

  const addPlateToSpec = async (plateId: number) => {
    if (!selectedSpec) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/plates-specializations/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plate_id: plateId, specialization_id: selectedSpec.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        Alert.alert('Ошибка', err.detail || 'Не удалось добавить блюдо');
        return;
      }
      const addedPlate = allMenuItems.find((p) => p.id === plateId);
      if (addedPlate) setLinkedPlates((prev) => [...prev, addedPlate]);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось добавить блюдо');
    }
  };

  const removePlateFromSpec = async (plateId: number) => {
    if (!selectedSpec) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/plates-specializations/specialization/${selectedSpec.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Ошибка поиска связи');
      const links = await res.json();
      const link = links.find((l: any) => l.plate_id === plateId);
      if (!link) throw new Error('Связь не найдена');

      await fetch(`${API_CONFIG.BASE_URL}/plates-specializations/${link.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setLinkedPlates((prev) => prev.filter((p) => p.id !== plateId));
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось удалить связь');
    }
  };

  const closeSpecModal = () => {
    setSpecModalVisible(false);
    setMode('list');
    setSelectedSpec(null);
    setLinkedPlates([]);
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
                    onPress={() => {
                      setModalVisible(false);
                      handleEditUser(selectedUser);
                    }}
                  >
                    <Ionicons name="create-outline" size={20} color="#fff" />
                    <Text style={styles.modalActionButtonText}>Редактировать</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.deleteButton]}
                    onPress={() => {
                      setModalVisible(false);
                      handleDeleteUser(selectedUser);
                    }}
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
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Логин *</Text>
                <TextInput
                  style={styles.input}
                  value={editData.login}
                  onChangeText={(t) => setEditData({ ...editData, login: t })}
                  placeholder="Введите логин"
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
                  secureTextEntry
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Роль</Text>
                <View style={styles.roleButtons}>
                  <TouchableOpacity
                    style={[styles.roleButton, editData.role === 'waiter' && styles.roleButtonActive]}
                    onPress={() => setEditData({ ...editData, role: 'waiter', specialization_id: null })}
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.specChip, !editData.specialization_id && styles.specChipActive]}
                        onPress={() => setEditData({ ...editData, specialization_id: null })}
                      >
                        <Text style={[styles.specChipText, !editData.specialization_id && styles.specChipTextActive]}>
                          Без специализации
                        </Text>
                      </TouchableOpacity>
                      {allSpecializations.map((spec) => (
                        <TouchableOpacity
                          key={spec.id}
                          style={[styles.specChip, editData.specialization_id === spec.id && styles.specChipActive]}
                          onPress={() => setEditData({ ...editData, specialization_id: spec.id })}
                        >
                          <Text
                            style={[
                              styles.specChipText,
                              editData.specialization_id === spec.id && styles.specChipTextActive,
                            ]}
                          >
                            {spec.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>Доступные блюда</Text>
                    <FlatList
                      data={allMenuItems.filter((m) => !linkedPlates.some((lp) => lp.id === m.id))}
                      keyExtractor={(item) => item.id.toString()}
                      style={{ maxHeight: 200 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.menuItem} onPress={() => addPlateToSpec(item.id)}>
                          <Text>{item.name}</Text>
                          <Ionicons name="add-circle-outline" size={22} color="#2ecc71" />
                        </TouchableOpacity>
                      )}
                    />
                    <Text style={styles.sectionTitle}>Привязанные блюда</Text>
                    <FlatList
                      data={linkedPlates}
                      keyExtractor={(item) => item.id.toString()}
                      style={{ maxHeight: 200 }}
                      renderItem={({ item }) => (
                        <View style={styles.menuItem}>
                          <Text>{item.name}</Text>
                          <TouchableOpacity onPress={() => removePlateFromSpec(item.id)}>
                            <Ionicons name="close-circle-outline" size={22} color="#e74c3c" />
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  </>
                )}
              </>
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
  header: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  groupsButton: { padding: 10 },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterGroup: { marginRight: 20 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  filterButtons: { flexDirection: 'row' },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  filterButtonActive: { backgroundColor: '#007AFF' },
  filterButtonText: { fontSize: 14, color: '#666' },
  filterButtonTextActive: { color: '#fff', fontWeight: '600' },
  listContainer: { padding: 10 },
  userItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userItemInactive: { opacity: 0.7, backgroundColor: '#f9f9f9' },
  userInfo: { flex: 1 },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  userName: { fontSize: 16, fontWeight: '600', color: '#333', flex: 1, marginRight: 10 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  cookBadge: { backgroundColor: '#ff6b6b' },
  waiterBadge: { backgroundColor: '#3498db' },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  userDetails: { gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userLogin: { fontSize: 14, color: '#666' },
  specializationText: { fontSize: 14, color: '#666' },
  statusText: { fontSize: 14, fontWeight: '500' },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 },
  actionButton: { padding: 8 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 15, textAlign: 'center' },
  addButton: { position: 'absolute', right: 20, bottom: 20, zIndex: 10 },
  addButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: width * 0.9,
    maxHeight: '80%',
    padding: 20,
  },
  closeButton: { position: 'absolute', right: 15, top: 15, zIndex: 1, padding: 5 },
  modalScrollView: { maxHeight: '100%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginRight: 30
  },
  modalHeaderSpecs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
  },
  modalName: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 10 },
  modalDetails: { gap: 15, marginBottom: 25 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { fontSize: 14, color: '#666', width: 60 },
  detailValue: { fontSize: 14, color: '#333', flex: 1 },
  modalActions: { gap: 10 },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  editButton: { backgroundColor: '#3498db' },
  deleteButton: { backgroundColor: '#e74c3c' },
  modalActionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editModalContent: { backgroundColor: '#fff', borderRadius: 16, width: width * 0.9, maxHeight: '90%' },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  editModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  editModalBody: { padding: 20 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  roleButtons: { flexDirection: 'row', gap: 10 },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  roleButtonActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  roleButtonText: { fontSize: 14, color: '#666', fontWeight: '500' },
  roleButtonTextActive: { color: '#fff' },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalFooter: { flexDirection: 'row', padding: 20, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, color: '#666', fontWeight: '600' },
  saveButton: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#007AFF', alignItems: 'center' },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  specInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addButtonSmall: {
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  specItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  specName: { fontSize: 16 },
  specChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  specChipActive: { backgroundColor: '#007AFF' },
  specChipText: { fontSize: 14, color: '#666' },
  specChipTextActive: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: { padding: 4 },
});

export default AdminStaff;