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

  const [showAddCooksDropdown, setShowAddCooksDropdown] = useState(false);
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
    setShowAddCooksDropdown(false);
    setSelectedCookIds(new Set());
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
      setGroupCooks(prev => prev.filter(c => c.id !== userId));
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось удалить повара');
    }
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

      const cooksToAdd = allCooks.filter(c => selectedCookIds.has(c.id));
      setGroupCooks(prev => [...prev, ...cooksToAdd]);

      setShowAddCooksDropdown(false);
      setSelectedCookIds(new Set());
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
              placeholderTextColor="#888787"
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

                  <TouchableOpacity
                    style={styles.addDetailButton}
                    onPress={() => {
                      setSelectedCookIds(new Set());
                      setShowAddCooksDropdown(!showAddCooksDropdown);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                    <Text style={styles.addDetailButtonText}>
                      {showAddCooksDropdown ? 'Скрыть' : 'Добавить поваров'}
                    </Text>
                  </TouchableOpacity>

                  {showAddCooksDropdown && (
                    <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, overflow: 'hidden' }}>
                      <ScrollView
                        style={{ maxHeight: 180 }}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {availableCooks.length === 0 ? (
                          <Text style={[styles.emptyDetail, { padding: 10 }]}>Нет доступных поваров</Text>
                        ) : (
                          availableCooks.map(cook => (
                            <TouchableOpacity
                              key={cook.id}
                              style={styles.selectItem}
                              onPress={() => toggleCookSelection(cook.id)}
                            >
                              {selectedCookIds.has(cook.id) ? (
                                <Ionicons name="checkbox" size={22} color="#2ecc71" />
                              ) : (
                                <Ionicons name="square-outline" size={22} color="#999" />
                              )}
                              <Text style={[styles.selectItemText, { marginLeft: 15 }]}>{cook.name}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                      <View style={styles.modalButtons}>
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => {
                            setShowAddCooksDropdown(false);
                            setSelectedCookIds(new Set());
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
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default CookGroupManagement;