import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage/LandingPage';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import BibliothecaireDashboard from './pages/BibliothecaireDashboard/BibliothecaireDashboard';
import EtudiantDashboard from './pages/EtudiantDashboard/EtudiantDashboard';
import EnseignantDashboard from './pages/EnseignantDashboard/EnseignantDashboard';
import './styles/global.css';

// Route protégée — redirige vers / si pas connecté ou mauvais rôle
function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

// Redirection automatique selon le rôle
function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  const routes = {
    ADMIN: '/admin',
    BIBLIOTHECAIRE: '/bibliothecaire',
    ETUDIANT: '/etudiant',
    ENSEIGNANT: '/enseignant',
  };
  return <Navigate to={routes[user.role] || '/'} replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Page publique d'accueil / login */}
      <Route
        path="/"
        element={user ? <RoleRedirect /> : <LandingPage />}
      />

      {/* Admin */}
      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AdminDashboard />
        </ProtectedRoute>
      } />

      {/* Bibliothécaire */}
      <Route path="/bibliothecaire/*" element={
        <ProtectedRoute allowedRoles={['BIBLIOTHECAIRE', 'ADMIN']}>
          <BibliothecaireDashboard />
        </ProtectedRoute>
      } />

      {/* Étudiant */}
      <Route path="/etudiant/*" element={
        <ProtectedRoute allowedRoles={['ETUDIANT']}>
          <EtudiantDashboard />
        </ProtectedRoute>
      } />

      {/* Enseignant */}
      <Route path="/enseignant/*" element={
        <ProtectedRoute allowedRoles={['ENSEIGNANT']}>
          <EnseignantDashboard />
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
