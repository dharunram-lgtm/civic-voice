const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : 'https://civicsmart-backend.onrender.com/api';
const AI_SERVICE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : 'https://civicsmart-backend.onrender.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('civic_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, error => Promise.reject(error));

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      if (error.response.status === 401) {
        console.warn('API returned 401 Unauthorized:', error.config?.url);
        // Only redirect to login if explicitly trying to log in or token is completely invalid
        const token = localStorage.getItem('civic_token');
        if (!token && !window.location.pathname.includes('login.html') && !window.location.pathname.includes('index.html')) {
          localStorage.removeItem('civic_token');
          localStorage.removeItem('civic_role');
          localStorage.removeItem('civic_user');
          window.location.href = '/login.html';
        }
      }
      if (error.response.status === 403) {
        console.warn('API returned 403 Forbidden:', error.config?.url);
      }
    }
    return Promise.reject(error);
  }
);

async function requestImageAnalysis(formData) {
  return api.post('/ai/image-analysis', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}