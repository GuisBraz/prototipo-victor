import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { isFirebaseConfigured } from "./firebase";
import { useOrganizations } from "./organizations";
import { ConfigMissingPage } from "./pages/ConfigMissingPage";
import { Layout } from "./pages/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";

function Protected() {
  const { user, loading } = useAuth();
  const orgs = useOrganizations();

  if (loading || (user && orgs.loading)) return <p className="muted center">Carregando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!orgs.current) return <OnboardingPage />;
  return <Layout />;
}

export function App() {
  if (!isFirebaseConfigured) return <ConfigMissingPage />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<OverviewPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
