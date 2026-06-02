import axios from 'axios';
import { API_CONFIG } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

let logoutHandler = null;
let refreshAccessTokenHandler = null;

export function setLogoutHandler(handler) {
  logoutHandler = handler;
}

export function setRefreshAccessTokenHandler(handler) {
  refreshAccessTokenHandler = handler;
}

const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.config?.url?.includes('/auth/login-json')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (refreshAccessTokenHandler) {
        const newToken = await refreshAccessTokenHandler();

        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      }

      if (logoutHandler) logoutHandler();
    }

    return Promise.reject(error);
  }
);

export const userAPI = {
  getUsers: () => api.get('/users'),
  getUser: (id) => api.get(`/users/${id}`),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
};

export const ordersAPI = {
  getOrders: () => api.get('/orders'),
  createOrder: (data) => api.post('/orders', data),
  updateOrder: (id, data) => api.put(`/orders/${id}`, data),
};

export default api;