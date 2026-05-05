import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';

import ProfileScreen from '../screens/ProfileScreen';
import ChefOrders from '../screens/ChefOrdersScreen';
import WaiterOrders from '../screens/WaiterOrdersScreen';
import WaiterMenu from '../screens/WaiterMenuScreen';
import AdminStaff from '../screens/AdminStaffScreen';
import AdminHallMap from '../screens/AdminHallMapScreen';
import AdminOrders from '../screens/AdminOrdersScreen';
import AdminReports from '../screens/AdminReportsScreen';
import MenuItemDetailScreen from '../screens/MenuItemScreen';
import MenuItemFormScreen from '../screens/EditMenuItemScreen';
import CookGroupManagement from '../screens/CookGroupsManage';

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

const MenuStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MenuList" component={WaiterMenu} />
    <Stack.Screen name="MenuItemDetail" component={MenuItemDetailScreen} />
    <Stack.Screen name="MenuItemForm" component={MenuItemFormScreen} options={{ headerShown: false }} />
  </Stack.Navigator>
);

const AdminStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminStaff" component={AdminStaff} />
    <Stack.Screen name="CookGroupManagement" component={CookGroupManagement} />
  </Stack.Navigator>
);

// Для повара
export const ChefDrawer = () => (
  <Drawer.Navigator
    screenOptions={{
      drawerStyle: {
        width: 250,
      },
      drawerItemStyle: {
        height: 80,
        justifyContent: 'center'
      },
      drawerLabelStyle: {
        fontSize: 18
      },
      drawerActiveTintColor: '#FF6B6B',
      headerStyle: {
        backgroundColor: '#FF6B6B',
        height: 120
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '800',
        fontSize: 20
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
      drawerItemStyle: {
        height: 80,
        justifyContent: 'center'
      },
      drawerLabelStyle: {
        fontSize: 18
      },
      drawerActiveTintColor: '#4ECDC4',
      headerStyle: {
        backgroundColor: '#4ECDC4',
        height: 120
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '800',
        fontSize: 20
      },
    }}
  >
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
      component={WaiterOrders}
      options={{
        headerTitle: 'Заказы',
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Меню"
      component={MenuStack}
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
        width: 250
      },
      drawerItemStyle: {
        height: 80,
        justifyContent: 'center'
      },
      drawerLabelStyle: {
        fontSize: 18
      },
      drawerActiveTintColor: '#45B7D1',
      headerStyle: {
        backgroundColor: '#45B7D1',
        height: 120
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '800',
        fontSize: 20
      },
    }}
  >
    <Drawer.Screen
      name="Персонал"
      component={AdminStack}
      options={{
        headerTitle: 'Управление персоналом',
        drawerLabel: 'Персонал',
      }}
    />
    <Drawer.Screen
      name="Меню"
      component={MenuStack}
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