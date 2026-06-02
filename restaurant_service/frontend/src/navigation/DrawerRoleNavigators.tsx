import React from 'react';
import { Text } from 'react-native';
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

const HeaderTitle = ({ title, color }: { title: string; color: string }) => (
  <Text
    numberOfLines={2}
    style={{
      fontSize: 20,
      fontWeight: '800',
      color: color,
      textAlign: 'center',
      flexShrink: 1,
    }}
  >
    {title}
  </Text>
);

const AdminDrawerBase = ({ color }: { color: string }) => (
  <Drawer.Navigator
    screenOptions={{
      drawerStyle: {
        width: 250,
        backgroundColor: color,
      },
      drawerItemStyle: {
        height: 80,
        justifyContent: 'center',
      },
      drawerLabelStyle: {
        fontSize: 18,
      },
      drawerActiveTintColor: '#FFFFFF',
      drawerInactiveTintColor: '#E8F1F9',
      headerStyle: {
        backgroundColor: color,
        height: 140,
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '800',
        fontSize: 20,
      },
    }}
  >
    <Drawer.Screen
      name="Персонал"
      component={AdminStack}
      options={{
        headerTitle: () => <HeaderTitle title="Управление персоналом" color="#FFFFFF" />,
        drawerLabel: 'Персонал',
      }}
    />
    <Drawer.Screen
      name="Меню"
      component={MenuStack}
      options={{
        headerTitle: () => <HeaderTitle title="Меню" color="#FFFFFF" />,
        drawerLabel: 'Меню',
      }}
    />
    <Drawer.Screen
      name="Зал"
      component={AdminHallMap}
      options={{
        headerTitle: () => <HeaderTitle title="Схема зала" color="#FFFFFF" />,
        drawerLabel: 'Зал',
      }}
    />
    <Drawer.Screen
      name="Заказы"
      component={AdminOrders}
      options={{
        headerTitle: () => <HeaderTitle title="Заказы" color="#FFFFFF" />,
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Статистика"
      component={AdminReports}
      options={{
        headerTitle: () => <HeaderTitle title="Статистика" color="#FFFFFF" />,
        drawerLabel: 'Статистика',
      }}
    />
    <Drawer.Screen
      name="Профиль"
      component={ProfileScreen}
      options={{
        headerTitle: () => <HeaderTitle title="Профиль" color="#FFFFFF" />,
        drawerLabel: 'Профиль',
      }}
    />
  </Drawer.Navigator>
);

export const AdminDrawer = () => <AdminDrawerBase color="#45B7D1" />;
export const SuperAdminDrawer = () => <AdminDrawerBase color="#6C5CE7" />;

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
        height: 140
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
        headerTitle: () => <HeaderTitle title="Заказы на кухню" color="#FFFFFF" />,
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Профиль"
      component={ProfileScreen}
      options={{
        headerTitle: () => <HeaderTitle title="Профиль" color="#FFFFFF" />,
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
        height: 140
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
        headerTitle: () => <HeaderTitle title="Схема зала" color="#FFFFFF" />,
        drawerLabel: 'Зал',
      }}
    />
    <Drawer.Screen
      name="Заказы"
      component={WaiterOrders}
      options={{
        headerTitle: () => <HeaderTitle title="Заказы" color="#FFFFFF" />,
        drawerLabel: 'Заказы',
      }}
    />
    <Drawer.Screen
      name="Меню"
      component={MenuStack}
      options={{
        headerTitle: () => <HeaderTitle title="Меню" color="#FFFFFF" />,
        drawerLabel: 'Меню',
      }}
    />
    <Drawer.Screen
      name="Профиль"
      component={ProfileScreen}
      options={{
        headerTitle: () => <HeaderTitle title="Профиль" color="#FFFFFF" />,
        drawerLabel: 'Профиль',
      }}
    />
  </Drawer.Navigator>
);

