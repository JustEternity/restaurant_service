import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Text } from 'react-native';

import ProfileScreen from '../screens/ProfileScreen';

import ChefOrders from '../screens/ChefOrdersScreen';

import WaiterHallMap from '../screens/WaiterHallMapScreen';
import WaiterOrders from '../screens/WaiterOrdersScreen';
import WaiterMenu from '../screens/WaiterMenuScreen';

import AdminStaff from '../screens/AdminStaffScreen';
import AdminMenu from '../screens/AdminMenuScreen';
import AdminHallMap from '../screens/AdminHallMapScreen';
import AdminOrders from '../screens/AdminOrdersScreen';
import AdminReports from '../screens/AdminReportsScreen';

const Drawer = createDrawerNavigator();



// Для повара
export const ChefDrawer = () => (
  <Drawer.Navigator
    screenOptions={{
      drawerStyle: {
        width: 500,
      },
      drawerActiveTintColor: '#FF6B6B',
      headerStyle: {
        backgroundColor: '#FF6B6B',
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '600',
      },
    }}
  >
    <Drawer.Screen
      name="Заказы"
      component={ChefOrders}
      options={{
        headerTitle: 'Заказы на кухню',
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Профиль"
      component={ProfileScreen}
      options={{
        headerTitle: 'Профиль повара',
        drawerLabel: 'Профиль',
      }}
    />
  </Drawer.Navigator>
);

// Для официанта
export const WaiterDrawer = () => (
  <Drawer.Navigator
    screenOptions={{
      drawerStyle: {
        width: 250,
      },
      drawerActiveTintColor: '#4ECDC4',
      headerStyle: {
        backgroundColor: '#4ECDC4',
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '600',
      },
    }}
  >
    <Drawer.Screen
      name="Зал"
      component={WaiterHallMap}
      options={{
        headerTitle: 'Схема зала',
        drawerLabel: 'Зал',
      }}
    />
    <Drawer.Screen
      name="Заказы"
      component={WaiterOrders}
      options={{
        headerTitle: 'Заказы',
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Меню"
      component={WaiterMenu}
      options={{
        headerTitle: 'Меню ресторана',
        drawerLabel: 'Меню',
      }}
    />
    <Drawer.Screen
      name="Профиль"
      component={ProfileScreen}
      options={{
        headerTitle: 'Профиль официанта',
        drawerLabel: 'Профиль',
      }}
    />
  </Drawer.Navigator>
);

// Для администратора
export const AdminDrawer = () => (
  <Drawer.Navigator
    screenOptions={{
      drawerStyle: {
        width: 250,
      },
      drawerActiveTintColor: '#45B7D1',
      headerStyle: {
        backgroundColor: '#45B7D1',
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '600',
      },
    }}
  >
    <Drawer.Screen
      name="Персонал"
      component={AdminStaff}
      options={{
        headerTitle: 'Управление персоналом',
        drawerLabel: 'Персонал',
      }}
    />
    <Drawer.Screen
      name="Меню"
      component={AdminMenu}
      options={{
        headerTitle: 'Меню',
        drawerLabel: 'Меню',
      }}
    />
    <Drawer.Screen
      name="Зал"
      component={AdminHallMap}
      options={{
        headerTitle: 'Схема зала',
        drawerLabel: 'Зал',
      }}
    />
    <Drawer.Screen
      name="Заказы"
      component={AdminOrders}
      options={{
        headerTitle: 'Заказы',
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Отчеты"
      component={AdminReports}
      options={{
        headerTitle: 'Отчеты по работе ресторана',
        drawerLabel: 'Отчеты',
      }}
    />
    <Drawer.Screen
      name="Профиль"
      component={ProfileScreen}
      options={{
        headerTitle: 'Профиль администратора',
        drawerLabel: 'Профиль',
      }}
    />
  </Drawer.Navigator>
);