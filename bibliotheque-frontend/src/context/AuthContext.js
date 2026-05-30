import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Charger l'utilisateur depuis localStorage au démarrage
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const setSession = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const login = async (email, password) => {
    const res = await authAPI.login({ email, mot_de_passe: password });
    const { token, user: userData, requireOtp } = res.data;
    if (requireOtp) {
      return { requireOtp: true, email: res.data.email || email };
    }
    return setSession(token, userData);
  };

  const logout = async () => {
    // Best-effort: tell the backend so it can record last_logout_at. Local
    // sign-out must still happen even if the network call fails.
    try {
      if (localStorage.getItem('token')) {
        await authAPI.logout();
      }
    } catch (_e) {
      /* ignore — proceed with local sign-out */
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUserData = (nextUser) => {
    setUser(prev => {
      const merged = { ...(prev || {}), ...(nextUser || {}) };
      try { localStorage.setItem('user', JSON.stringify(merged)); } catch (_e) { /* ignore */ }
      return merged;
    });
  };

  const value = { user, login, logout, setSession, updateUserData, loading, isAuthenticated: !!user };

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#020818',
        color: '#c9a84c', fontFamily: 'DM Sans, sans-serif', fontSize: '1.1rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 50, height: 50, border: '3px solid rgba(201,168,76,0.3)',
            borderTopColor: '#c9a84c', borderRadius: '50%',
            animation: 'spin 1s linear infinite', margin: '0 auto 16px',
          }} />
          Chargement...
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
