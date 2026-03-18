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
  Dimensions
} from 'react-native';
import { API_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface User {
  id: number;
  name: string;
  login: string;
  role: string;
  is_available: boolean;
}

interface EditUserData {
  name: string;
  login: string;
  password: string;
  role: string;
  is_available: boolean;
}

type ActiveFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | 'cook' | 'waiter';

const AdminStaff = () => {
  const { authToken, user } = useAuth();
  const [staff, setStaff] = useState<User[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);

  // Фильтры
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Данные для редактирования
  const [editData, setEditData] = useState<EditUserData>({
    name: '',
    login: '',
    password: '',
    role: 'waiter',
    is_available: true
  });

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/users/`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: User[] = await response.json();
      const nonAdminUsers = data.filter((user: User) => user.role !== 'admin');
      setStaff(nonAdminUsers);
      applyFilters(nonAdminUsers);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить список сотрудников');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const applyFilters = (userList: User[] = staff) => {
    let filtered = userList;

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    if (activeFilter !== 'all') {
      const isActive = activeFilter === 'active';
      filtered = filtered.filter(user => user.is_available === isActive);
    }

    filtered.sort((a, b) => {
      if (a.is_available !== b.is_available) {
        return b.is_available ? 1 : -1;
      }
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

  const handleUserPress = (user: User) => {
    setSelectedUser(user);
    setModalVisible(true);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditData({
      name: user.name,
      login: user.login,
      password: '',
      role: user.role,
      is_available: user.is_available
    });
    setEditModalVisible(true);
  };

  const handleDeleteUser = (user: User) => {
    Alert.alert(
      'Удаление сотрудника',
      `Вы уверены, что хотите удалить сотрудника ${user.name}?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => deleteUser(user.id)
        }
      ]
    );
  };

  const deleteUser = async (userId: number) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedStaff = staff.filter(user => user.id !== userId);
      setStaff(updatedStaff);
      Alert.alert('Успех', 'Сотрудник удален');
    } catch (error) {
      console.error('Ошибка удаления:', error);
      Alert.alert('Ошибка', 'Не удалось удалить сотрудника');
    }
  };

  const handleSaveUser = async () => {
    if (!editData.name.trim()) {
        Alert.alert('Ошибка', 'Введите имя сотрудника');
        return;
    }

    if (!editData.login.trim()) {
        Alert.alert('Ошибка', 'Введите логин');
        return;
    }

    try {
        const updateData: any = {
        name: editData.name,
        login: editData.login,
        role: editData.role,
        is_available: editData.is_available
        };

        if (editData.password.trim()) {
        updateData.password = editData.password;
        }

        const response = await fetch(`${API_CONFIG.BASE_URL}/users/${selectedUser?.id}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(updateData)
        });

        if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const updatedUser: User = await response.json();

        const updatedStaff = staff.map(user =>
        user.id === selectedUser?.id ? updatedUser : user
        );
        setStaff(updatedStaff);

        setEditModalVisible(false);
        Alert.alert('Успех', 'Данные сотрудника обновлены');
    } catch (error) {
        console.error('Ошибка обновления:', error);
        Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось обновить данные сотрудника');
    }
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setEditData({
      name: '',
      login: '',
      password: '',
      role: 'waiter',
      is_available: true
    });
    setEditModalVisible(true);
  };

  const handleCreateUser = async () => {
    if (!editData.name.trim()) {
        Alert.alert('Ошибка', 'Введите имя сотрудника');
        return;
    }

    if (!editData.login.trim()) {
        Alert.alert('Ошибка', 'Введите логин');
        return;
    }

    if (!editData.password.trim()) {
        Alert.alert('Ошибка', 'Введите пароль');
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/users/`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            name: editData.name,
            login: editData.login,
            password: editData.password,
            role: editData.role,
            is_available: editData.is_available
        })
        });

        if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const newUser: User = await response.json();

        setStaff([...staff, newUser]);

        setEditModalVisible(false);
        Alert.alert('Успех', 'Сотрудник добавлен');
    } catch (error) {
        console.error('Ошибка создания:', error);
        Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось добавить сотрудника');
    }
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[
        styles.userItem,
        !item.is_available && styles.userItemInactive
      ]}
      onPress={() => handleUserPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text style={styles.userName}>{item.name}</Text>
          <View style={[
            styles.roleBadge,
            item.role === 'cook' ? styles.cookBadge : styles.waiterBadge
          ]}>
            <Text style={styles.roleText}>
              {item.role === 'cook' ? 'Повар' : 'Официант'}
            </Text>
          </View>
        </View>

        <View style={styles.userDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.userLogin}>{item.login}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons
              name={item.is_available ? "checkmark-circle" : "close-circle"}
              size={16}
              color={item.is_available ? "#2ecc71" : "#e74c3c"}
            />
            <Text style={[
              styles.statusText,
              { color: item.is_available ? "#2ecc71" : "#e74c3c" }
            ]}>
              {item.is_available ? 'Активен' : 'Неактивен'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.userActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditUser(item)}
        >
          <Ionicons name="create-outline" size={22} color="#3498db" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDeleteUser(item)}
        >
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
      {/* Заголовок с фильтрами */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Сотрудники</Text>
        <Text style={styles.headerSubtitle}>
          {filteredStaff.length} сотрудников
        </Text>
      </View>

      {/* Фильтры */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {/* Фильтр по роли */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Роль:</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  roleFilter === 'all' && styles.filterButtonActive
                ]}
                onPress={() => setRoleFilter('all')}
              >
                <Text style={[
                  styles.filterButtonText,
                  roleFilter === 'all' && styles.filterButtonTextActive
                ]}>
                  Все
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterButton,
                  roleFilter === 'cook' && styles.filterButtonActive
                ]}
                onPress={() => setRoleFilter('cook')}
              >
                <Text style={[
                  styles.filterButtonText,
                  roleFilter === 'cook' && styles.filterButtonTextActive
                ]}>
                  Повара
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterButton,
                  roleFilter === 'waiter' && styles.filterButtonActive
                ]}
                onPress={() => setRoleFilter('waiter')}
              >
                <Text style={[
                  styles.filterButtonText,
                  roleFilter === 'waiter' && styles.filterButtonTextActive
                ]}>
                  Официанты
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Фильтр по активности */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Статус:</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  activeFilter === 'all' && styles.filterButtonActive
                ]}
                onPress={() => setActiveFilter('all')}
              >
                <Text style={[
                  styles.filterButtonText,
                  activeFilter === 'all' && styles.filterButtonTextActive
                ]}>
                  Все
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterButton,
                  activeFilter === 'active' && styles.filterButtonActive
                ]}
                onPress={() => setActiveFilter('active')}
              >
                <Text style={[
                  styles.filterButtonText,
                  activeFilter === 'active' && styles.filterButtonTextActive
                ]}>
                  Активные
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterButton,
                  activeFilter === 'inactive' && styles.filterButtonActive
                ]}
                onPress={() => setActiveFilter('inactive')}
              >
                <Text style={[
                  styles.filterButtonText,
                  activeFilter === 'inactive' && styles.filterButtonTextActive
                ]}>
                  Неактивные
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Список сотрудников */}
      <FlatList
        data={filteredStaff}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
          />
        }
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>
              {staff.length === 0
                ? 'Нет сотрудников'
                : 'Нет сотрудников по выбранным фильтрам'}
            </Text>
          </View>
        }
      />

      {/* Кнопка добавления */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAddUser}
        activeOpacity={0.8}
      >
        <View style={styles.addButtonInner}>
          <Ionicons name="add" size={28} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* Модальное окно деталей */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            {selectedUser && (
              <ScrollView style={styles.modalScrollView}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalName}>{selectedUser.name}</Text>
                  <View style={[
                    styles.roleBadge,
                    selectedUser.role === 'cook' ? styles.cookBadge : styles.waiterBadge
                  ]}>
                    <Text style={styles.roleText}>
                      {selectedUser.role === 'cook' ? 'Повар' : 'Официант'}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons name="person-outline" size={18} color="#666" />
                    <Text style={styles.detailLabel}>Логин:</Text>
                    <Text style={styles.detailValue}>{selectedUser.login}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons
                      name={selectedUser.is_available ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={selectedUser.is_available ? "#2ecc71" : "#e74c3c"}
                    />
                    <Text style={styles.detailLabel}>Статус:</Text>
                    <Text style={[
                      styles.detailValue,
                      { color: selectedUser.is_available ? "#2ecc71" : "#e74c3c" }
                    ]}>
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

      {/* Модальное окно редактирования/добавления */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>
                {selectedUser ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
              </Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editModalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Имя *</Text>
                <TextInput
                  style={styles.input}
                  value={editData.name}
                  onChangeText={(text) => setEditData({...editData, name: text})}
                  placeholder="Введите имя"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Логин *</Text>
                <TextInput
                  style={styles.input}
                  value={editData.login}
                  onChangeText={(text) => setEditData({...editData, login: text})}
                  placeholder="Введите логин"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Пароль {selectedUser ? '(оставьте пустым, чтобы не менять)' : '*'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={editData.password}
                  onChangeText={(text) => setEditData({...editData, password: text})}
                  placeholder="Введите пароль"
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Роль</Text>
                <View style={styles.roleButtons}>
                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      editData.role === 'waiter' && styles.roleButtonActive
                    ]}
                    onPress={() => setEditData({...editData, role: 'waiter'})}
                  >
                    <Ionicons
                      name="restaurant-outline"
                      size={20}
                      color={editData.role === 'waiter' ? '#fff' : '#666'}
                    />
                    <Text style={[
                      styles.roleButtonText,
                      editData.role === 'waiter' && styles.roleButtonTextActive
                    ]}>
                      Официант
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      editData.role === 'cook' && styles.roleButtonActive
                    ]}
                    onPress={() => setEditData({...editData, role: 'cook'})}
                  >
                    <Ionicons
                      name="flame-outline"
                      size={20}
                      color={editData.role === 'cook' ? '#fff' : '#666'}
                    />
                    <Text style={[
                      styles.roleButtonText,
                      editData.role === 'cook' && styles.roleButtonTextActive
                    ]}>
                      Повар
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.switchGroup}>
                <Text style={styles.inputLabel}>Активен</Text>
                <Switch
                  value={editData.is_available}
                  onValueChange={(value) => setEditData({...editData, is_available: value})}
                  trackColor={{ false: "#ddd", true: "#2ecc71" }}
                  thumbColor={editData.is_available ? "#fff" : "#f4f3f4"}
                />
              </View>
            </ScrollView>

            <View style={styles.editModalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={selectedUser ? handleSaveUser : handleCreateUser}
              >
                <Text style={styles.saveButtonText}>
                  {selectedUser ? 'Сохранить' : 'Добавить'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterGroup: {
    marginRight: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
  },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 10,
  },
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
  userItemInactive: {
    opacity: 0.7,
    backgroundColor: '#f9f9f9',
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cookBadge: {
    backgroundColor: '#ff6b6b',
  },
  waiterBadge: {
    backgroundColor: '#3498db',
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  userDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userLogin: {
    fontSize: 14,
    color: '#666',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 10,
  },
  actionButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 15,
    textAlign: 'center',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    zIndex: 10,
  },
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
  closeButton: {
    position: 'absolute',
    right: 15,
    top: 15,
    zIndex: 1,
    padding: 5,
  },
  modalScrollView: {
    maxHeight: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  modalDetails: {
    gap: 15,
    marginBottom: 25,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    width: 60,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  modalActions: {
    gap: 10,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  editButton: {
    backgroundColor: '#3498db',
  },
  deleteButton: {
    backgroundColor: '#e74c3c',
  },
  modalActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  editModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: width * 0.9,
    maxHeight: '90%',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  editModalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 10,
  },
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
  roleButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  roleButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});

export default AdminStaff;