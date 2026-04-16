import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Navbar from "./components/Navbar";
import { useAuth } from "./context/AuthContext";

const ThreeBackdrop = lazy(() => import("./components/ThreeBackdrop"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const DatasetDetailPage = lazy(() => import("./pages/DatasetDetailPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <p className="loader">Loading session...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return children;
}

export default function App() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <Suspense fallback={null}>
        <ThreeBackdrop />
      </Suspense>
      <Navbar />
      <main>
        <Suspense fallback={<p className="loader">Loading page...</p>}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <Routes>
                <Route
                  path="/"
                  element={<DashboardPage />}
                />
                <Route
                  path="/upload"
                  element={
                    <ProtectedRoute>
                      <UploadPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/datasets/:id"
                  element={<DatasetDetailPage />}
                />
                <Route path="/signin" element={<AuthPage mode="login" />} />
                <Route path="/login" element={<Navigate to="/signin" replace />} />
                <Route path="/register" element={<AuthPage mode="register" />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
