import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { DashboardView } from "@/components/views/DashboardView";
import { StoryView } from "@/components/views/StoryView";
import { ReviewView } from "@/components/views/ReviewView";
import { VocabularyView } from "@/components/views/VocabularyView";
import { HistoryView } from "@/components/views/HistoryView";
import { SettingsView } from "@/components/views/SettingsView";
import { LoginView } from "@/components/views/LoginView";
import { RegisterView } from "@/components/views/RegisterView";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginView />} />
      <Route path="/register" element={<RegisterView />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardView />} />
        <Route path="story/:storyId?" element={<StoryView />} />
        <Route path="review" element={<ReviewView />} />
        <Route path="vocabulary" element={<VocabularyView />} />
        <Route path="history" element={<HistoryView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
