import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

// Hôte du backend sans le suffixe /api/v1 (pour les fichiers statiques hérités).
export const API_HOST = BASE_URL.replace(/\/api\/v1\/?$/, '');

// Résout l'URL d'un asset (couverture de livre, etc.) :
//   - URL absolue (Cloudinary) → utilisée telle quelle
//   - chemin relatif hérité (/uploads/...) → préfixé par l'hôte backend
export const resolveAssetUrl = (val) => {
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  return `${API_HOST}${val.startsWith('/') ? '' : '/'}${val}`;
};

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
    const publicAuthPaths = [
      '/auth/login',
      '/auth/verify-login',
      '/auth/resend-login',
      '/auth/register',
      '/auth/verify-registration',
      '/auth/resend-registration',
      '/auth/forgot-password',
      '/auth/verify-reset-code',
      '/auth/reset-password',
    ];
    const requestUrl = error.config?.url || '';
    const isPublicAuthRequest = publicAuthPaths.some(path => requestUrl.includes(path));

    if (error.response?.status === 401 && !isPublicAuthRequest && !error.config?.skipAuthRedirect) {
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
  verifyLogin: (data) => api.post('/auth/verify-login', data),
  resendLoginCode: (data) => api.post('/auth/resend-login', data),
  register: (data) => api.post('/auth/register', data),
  verifyRegistration: (data) => api.post('/auth/verify-registration', data),
  resendRegistrationCode: (data) => api.post('/auth/resend-registration', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  verifyResetCode: (data) => api.post('/auth/verify-reset-code', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateMe: (data) => api.put('/auth/me', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  getUsers: (params) => api.get('/auth/users', { params }),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  toggleBloquer: (id, bloquer) => api.put(`/auth/users/${id}/bloquer`, { bloquer }),
};

// ── CATÉGORIES ──────────────────────────────────────────────
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  getById: (id) => api.get(`/categories/${id}`),
  getResources: (id) => api.get(`/categories/${id}/ressources`),
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
  streamFile: (id, config = {}) => api.get(`/documents/${id}/stream`, { responseType: 'blob', ...config }),
  downloadFile: (id, config = {}) => api.get(`/documents/${id}/download`, { responseType: 'blob', ...config }),
  update: (id, data) => api.put(`/documents/${id}`, data),
  delete: (id) => api.delete(`/documents/${id}`),
  getMesLectures: () => api.get('/documents/historique/mes-lectures'),
};

// ── EMPRUNTS ────────────────────────────────────────────────
export const empruntsAPI = {
  getAll: (params) => api.get('/emprunts', { params }),
  getMesEmprunts: (params) => api.get('/emprunts/mes-emprunts', { params }),
  getRetards: () => api.get('/emprunts/retards'),
  creer: (data) => api.post('/emprunts', data),
  creerAdmin: (data) => api.post('/emprunts/admin', data),
  valider: (id, data = {}) => api.put(`/emprunts/${id}/valider`, data),
  refuser: (id, data) => api.put(`/emprunts/${id}/refuser`, data),
  retourner: (id) => api.put(`/emprunts/${id}/retourner`),
  annuler: (id) => api.put(`/emprunts/${id}/annuler`),
  prolonger: (id, data) => api.put(`/emprunts/${id}/prolonger`, data),
  reserver: (data) => api.post('/emprunts/reservations', data),
  getAllReservations: (params) => api.get('/emprunts/reservations', { params }),
  approveReservation: (id) => api.put(`/emprunts/reservations/${id}/approve`),
  cancelReservation: (id) => api.put(`/emprunts/reservations/${id}/cancel`),
  getMesReservations: () => api.get('/emprunts/mes-reservations'),
  annulerMaReservation: (id) => api.put(`/emprunts/reservations/${id}/annuler`),
};

// ── STATS ────────────────────────────────────────────────────
export const supportAPI = {
  createSupportTicket: (data) => api.post('/support/tickets', data),
  getMySupportTickets: () => api.get('/support/my-tickets'),
  // Admin
  getAllSupportTickets: () => api.get('/support/admin/tickets'),
  getSupportTicketById: (id) => api.get(`/support/admin/tickets/${id}`),
  replyToSupportTicket: (id, reponse_admin) =>
    api.patch(`/support/admin/tickets/${id}/reply`, { reponse_admin }),
  updateSupportTicketStatus: (id, statut) =>
    api.patch(`/support/admin/tickets/${id}/status`, { statut }),
};

// ── NOTIFICATIONS ───────────────────────────────────────────
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/mark-all-read'),
};

export const statsAPI = {
  getDashboard: () => api.get('/stats/dashboard'),
  getStatsEmprunts: () => api.get('/stats/emprunts'),
  getRessourcesPopulaires: () => api.get('/stats/ressources-populaires'),
  getRepartition: () => api.get('/stats/repartition'),
  getStatsReservations: () => api.get('/stats/reservations'),
  getMesCours: () => api.get('/stats/mes-cours'),
  getAdminStats: () => api.get('/stats/admin'),
};

export default api;
