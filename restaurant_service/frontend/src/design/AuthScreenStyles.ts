import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const Colors = {
  primary: '#D35400',       // Тёплый терракотовый (основной акцент)
  primaryLight: '#E67E22',
  background: '#FDFEFE',    // Чистый белый фон
  card: '#FFFFFF',          // Фон карточек
  text: '#2C3E50',          // Основной текст (тёмно-синий)
  textSecondary: '#7F8C8D', // Второстепенный текст
  border: '#D5DBDB',        // Цвет границ
  error: '#E74C3C',         // Цвет ошибок
  success: '#27AE60',       // Цвет успеха
  overlay: 'rgba(0,0,0,0.1)', // Полупрозрачный оверлей
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  keyboardView: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 30,
  },

  header: {
    alignItems: 'center',
    marginTop: 20,
  },

  logoContainer: {
    width: 100,
    height: 100,
    backgroundColor: Colors.primary,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },

  logoIcon: {
    fontSize: 40,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  form: {
    marginTop: 0,
  },

  inputContainer: {
    marginBottom: 50,
  },

  label: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    marginLeft: 4
  },

  input: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.text,
    // Тень для полей ввода
    shadowColor: Colors.overlay,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  errorContainer: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },

  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '500',
  },

  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
    // Тень для кнопки
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },

  loginButtonDisabled: {
    opacity: 0.7,
  },

  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  testContainer: {
    marginTop: 30,
    padding: 15,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },

  testTitle: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '500',
  },

  testButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  testButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 8,
    marginHorizontal: 3,
    alignItems: 'center',
  },

  testButtonChef: {
    backgroundColor: '#FFEAA7',
    borderColor: '#FDCB6E',
    borderWidth: 1,
  },

  testButtonWaiter: {
    backgroundColor: '#D8F5E3',
    borderColor: '#00B894',
    borderWidth: 1,
  },

  testButtonAdmin: {
    backgroundColor: '#D0E6FF',
    borderColor: '#0984E3',
    borderWidth: 1,
  },

  testButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },

  subtitle: {
    fontSize: 16,
    color: '#6C757D',
    marginTop: 5,
  },
});

export default styles;