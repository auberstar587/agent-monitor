import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Agents from "./pages/Agents";
import Outputs from "./pages/Outputs";
import Memory from "./pages/Memory";
import Inbox from "./pages/Inbox";
import BlueprintList from "./pages/BlueprintList";
import BlueprintStudio from "./pages/BlueprintStudio";
import AgentDetail from "./pages/AgentDetail";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="outputs" element={<Outputs />} />
        <Route path="memory" element={<Memory />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="blueprints" element={<BlueprintList />} />
        <Route path="blueprints/:id" element={<BlueprintStudio />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
