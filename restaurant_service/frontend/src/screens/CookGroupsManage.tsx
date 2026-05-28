import React, { useState, useEffect } from 'react';
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
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../design/CookGroupsManageStyles';

interface CookGroup {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  login: string;
  role: string;
  is_available: boolean;
}

const CookGroupManagement = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [groups, setGroups] = useState<CookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CookGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<CookGroup | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [groupCooks, setGroupCooks] = useState<User[]>([]);
  const [allCooks, setAllCooks] = useState<User[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [selectedCookIds, setSelectedCookIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadGroups();
    loadAllCooks();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cook-groups/');
      setGroups(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Ошибка', 'Не удалось загрузить группы поваров');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAllCooks = async () => {
    try {
      const response = await api.get('/users/?role=cook');
      setAllCooks(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadGroupDetails = async (groupId: number) => {
    setLoadingDetails(true);
    try {
      const response = await api.get(`/cook-groups/${groupId}/cooks/`);
      setGroupCooks(response.data);
    } catch (error) {
      console.error('Error loading group cooks:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить поваров группы');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadGroups();
  };

  const openCreateModal = () => {
    setEditingGroup(null);
    setGroupName('');
    setModalVisible(true);
  };

  const openEditModal = (group: CookGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setModalVisible(true);
  };

  const openDetailModal = async (group: CookGroup) => {
    setSelectedGroup(group);
    await loadGroupDetails(group.id);
    setDetailModalVisible(true);
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Ошибка', 'Введите название группы');
      return;
    }

    const payload = { name: groupName.trim() };
    try {
      let savedGroup;
      if (editingGroup) {
        const response = await api.put(`/cook-groups/${editingGroup.id}`, payload);
        savedGroup = response.data;
      } else {
        const response = await api.post('/cook-groups/', payload);
        savedGroup = response.data;
      }

      if (editingGroup) {
        setGroups(prev => prev.map(g => (g.id === savedGroup.id ? savedGroup : g)));
      } else {
        setGroups(prev => [...prev, savedGroup]);
      }
      setModalVisible(false);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось сохранить группу');
    }
  };

  const handleDeleteGroup = (group: CookGroup) => {
    Alert.alert(
      'Удаление группы',
      `Вы уверены, что хотите удалить группу "${group.name}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/cook-groups/${group.id}`);
              setGroups(prev => prev.filter(g => g.id !== group.id));
            } catch (error: any) {
              Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось удалить группу');
            }
          },
        },
      ]
    );
  };

  const removeCookFromGroup = async (userId: number) => {
    if (!selectedGroup) return;
    try {
      await api.delete(`/cook-groups/${selectedGroup.id}/cooks/${userId}`);
      await loadGroupDetails(selectedGroup.id);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось удалить повара');
    }
  };

  const openSelectModal = () => {
    setDetailModalVisible(false);
    setSelectedCookIds(new Set());
    setSelectModalVisible(true);
  };

  const toggleCookSelection = (cookId: number) => {
    setSelectedCookIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cookId)) {
        newSet.delete(cookId);
      } else {
        newSet.add(cookId);
      }
      return newSet;
    });
  };

  const addSelectedCooks = async () => {
    if (!selectedGroup || selectedCookIds.size === 0) return;
    try {
      const ids = Array.from(selectedCookIds);
      await api.post(`/cook-groups/${selectedGroup.id}/cooks/batch`, { user_ids: ids });
      await loadGroupDetails(selectedGroup.id);
      setSelectModalVisible(false);
      setDetailModalVisible(true);
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.detail || 'Не удалось добавить поваров');
    }
  };

  const renderGroupItem = ({ item }: { item: CookGroup }) => (
    <TouchableOpacity style={styles.groupItem} onPress={() => openDetailModal(item)} activeOpacity={0.7}>
      <View style={styles.groupInfo}>
        <Text style={styles.groupName}>{item.name}</Text>
      </View>
      <View style={styles.groupActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionButton}>
          <Ionicons name="create-outline" size={20} color="#3498db" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteGroup(item)} style={styles.actionButton}>
          <Ionicons name="trash-outline" size={20} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const availableCooks = allCooks.filter(cook => !groupCooks.some(gc => gc.id === cook.id));

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка групп...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Группы поваров</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        renderItem={renderGroupItem}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007AFF']} />}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-circle-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Нет групп поваров</Text>
            <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
              <Text style={styles.createButtonText}>Создать первую группу</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Модалка создания/редактирования группы */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingGroup ? 'Редактировать группу' : 'Создать группу'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Название группы"
              placeholderTextColor= "#888787"
              value={groupName}
              onChangeText={setGroupName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveGroup}>
                <Text style={styles.saveButtonText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Детальное окно группы */}
      <Modal visible={detailModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{selectedGroup?.name}</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {loadingDetails ? (
              <ActivityIndicator style={styles.detailLoader} />
            ) : (
              <ScrollView>
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>Повара в группе</Text>
                  <FlatList
                    data={groupCooks}
                    renderItem={({ item }) => (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailItemText}>{item.name}</Text>
                        <TouchableOpacity onPress={() => removeCookFromGroup(item.id)}>
                          <Ionicons name="close-circle" size={22} color="#e74c3c" />
                        </TouchableOpacity>
                      </View>
                    )}
                    keyExtractor={(item) => item.id.toString()}
                    scrollEnabled={false}
                    nestedScrollEnabled={true}
                    style={{ maxHeight: 300 }}
                    ListEmptyComponent={<Text style={styles.emptyDetail}>Нет поваров</Text>}
                  />
                  <TouchableOpacity style={styles.addDetailButton} onPress={openSelectModal}>
                    <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                    <Text style={styles.addDetailButtonText}>Добавить поваров</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={selectModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.selectModalContent}>
            <Text style={styles.modalTitle}>Выберите поваров</Text>
            <FlatList
              data={availableCooks}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.selectItem}
                  onPress={() => toggleCookSelection(item.id)}
                >
                  <Text style={styles.selectItemText}>{item.name}</Text>
                  {selectedCookIds.has(item.id) ? (
                    <Ionicons name="checkbox" size={22} color="#2ecc71" />
                  ) : (
                    <Ionicons name="square-outline" size={22} color="#999" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyDetail}>Нет доступных поваров</Text>}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setSelectModalVisible(false);
                  setDetailModalVisible(true);
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, selectedCookIds.size === 0 && { opacity: 0.5 }]}
                onPress={addSelectedCooks}
                disabled={selectedCookIds.size === 0}
              >
                <Text style={styles.saveButtonText}>
                  Добавить ({selectedCookIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default CookGroupManagement;