import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logoIcon}>🍽️</Text>
      </View>
      <Text style={styles.title}>Restaurant Helper</Text>
      <ActivityIndicator size="large" color="#FF6B6B" style={styles.spinner} />
      <Text style={styles.subtitle}>Загрузка...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoIcon: {
    fontSize: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 30,
  },
  spinner: {
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#636E72',
  },
});

export default LoadingScreen;