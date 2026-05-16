import { API_CONFIG } from '../config';

const SERVER_URL =  API_CONFIG.BASE_URL;

export const getPhotoUrl = (photo: string | null | undefined) => {
  if (!photo) return null;
  if (photo.startsWith('http') || photo.startsWith('file://')) return photo;
  return `${SERVER_URL}${photo}`;;
};