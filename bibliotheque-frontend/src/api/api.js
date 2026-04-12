import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

// Instance axios avec config de base
const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Intercepteur : ajouter le token JWT automatiquement
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur : gérer les erreurs globalement
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expiré ou invalide → rediriger vers login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ── AUTH ────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
  getUsers: (params) => api.get('/auth/users', { params }),
  toggleBloquer: (id, bloquer) => api.put(`/auth/users/${id}/bloquer`, { bloquer }),
};

// ── CATÉGORIES ──────────────────────────────────────────────
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  getById: (id) => api.get(`/categories/${id}`),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

// ── LIVRES ──────────────────────────────────────────────────
export const livresAPI = {
  getAll: (params) => api.get('/livres', { params }),
  search: (q, params) => api.get('/livres/search', { params: { q, ...params } }),
  getRayons: () => api.get('/livres/rayons'),
  getById: (id) => api.get(`/livres/${id}`),
  create: (formData) => api.post('/livres', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  update: (id, formData) => api.put(`/livres/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  delete: (id) => api.delete(`/livres/${id}`),
};

// ── DOCUMENTS ───────────────────────────────────────────────
export const documentsAPI = {
  getAll: (params) => api.get('/documents', { params }),
  getById: (id) => api.get(`/documents/${id}`),
  upload: (formData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getStreamUrl: (id) => `${BASE_URL}/documents/${id}/stream`,
  getDownloadUrl: (id) => `${BASE_URL}/documents/${id}/download`,
  delete: (id) => api.delete(`/documents/${id}`),
  getMesLectures: () => api.get('/documents/historique/mes-lectures'),
};

// ── EMPRUNTS ────────────────────────────────────────────────
export const empruntsAPI = {
  getAll: (params) => api.get('/emprunts', { params }),
  getMesEmprunts: (params) => api.get('/emprunts/mes-emprunts', { params }),
  getRetards: () => api.get('/emprunts/retards'),
  creer: (data) => api.post('/emprunts', data),
  valider: (id, data) => api.put(`/emprunts/${id}/valider`, data),
  refuser: (id, data) => api.put(`/emprunts/${id}/refuser`, data),
  retourner: (id) => api.put(`/emprunts/${id}/retourner`),
  annuler: (id) => api.put(`/emprunts/${id}/annuler`),
  reserver: (data) => api.post('/emprunts/reservations', data),
};

// ── STATS ────────────────────────────────────────────────────
export const statsAPI = {
  getDashboard: () => api.get('/stats/dashboard'),
  getStatsEmprunts: () => api.get('/stats/emprunts'),
  getRessourcesPopulaires: () => api.get('/stats/ressources-populaires'),
  getRepartition: () => api.get('/stats/repartition'),
  getMesCours: () => api.get('/stats/mes-cours'),
};

export default api;