import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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

// Roles that own a private dashboard. GUEST does not — guests stay on the
// public landing page until staff converts their account to STUDENT/TEACHER.
const ROLE_DASHBOARD_ROUTES = {
  ADMIN: '/admin',
  BIBLIOTHECAIRE: '/bibliothecaire',
  ETUDIANT: '/etudiant',
  ENSEIGNANT: '/enseignant',
};

// Redirection automatique selon le rôle
function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  const target = ROLE_DASHBOARD_ROUTES[user.role];
  // GUEST (or any unknown role) has no dashboard: render the landing page.
  if (!target) return <LandingPage />;
  return <Navigate to={target} replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  const hasDashboard = user && ROLE_DASHBOARD_ROUTES[user.role];

  return (
    <Routes>
      {/* Page publique d'accueil / login.
          - Anonymous user → landing.
          - GUEST (no dashboard) → landing as well.
          - STUDENT / TEACHER / LIBRARIAN / ADMIN → redirect to their dashboard. */}
      <Route
        path="/"
        element={hasDashboard ? <RoleRedirect /> : <LandingPage />}
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
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
