export const API_CONFIG = {
  BASE_URL: 'http://192.168.3.111:8000/api',
  WS_BASE_URL: 'ws://192.168.3.111:8000',

  STORAGE_KEYS: {
    AUTH_TOKEN: '@auth_token',
    USER_DATA: '@user_data',
    REFRESH_TOKEN: '@refresh_token'
  }
};

export const UserRoles = {
  COOK: 'cook',
  WAITER: 'waiter',
  ADMIN: 'admin'
};