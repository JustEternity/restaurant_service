import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OrderDraftProvider } from './src/context/OrderDraftContext';
import { ChefDrawer, WaiterDrawer, AdminDrawer, SuperAdminDrawer } from './src/navigation/DrawerRoleNavigators';
import AuthScreen from './src/screens/AuthScreen';
import LoadingScreen from './src/components/LoadingScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            {user?.role === 'cook' && (
              <Stack.Screen name="Main" component={ChefDrawer} />
            )}
            {user?.role === 'waiter' && (
              <Stack.Screen name="Main" component={WaiterDrawer} />
            )}
            {user?.role === 'admin' && (
              <Stack.Screen name="Main" component={AdminDrawer} />
            )}
            {user?.role === 'superadmin' && (
              <Stack.Screen name="Main" component={SuperAdminDrawer} />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OrderDraftProvider>
        <AppNavigator/>
      </OrderDraftProvider>
    </AuthProvider>
  );
}