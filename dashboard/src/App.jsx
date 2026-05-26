import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Tasks from './pages/Tasks';
import Agents from './pages/Agents';
import Settings from './pages/Settings';
import { useEffect } from 'react';
import { initSocket } from './api/client';
import { useStore } from './store/useStore';

function App() {
  const setAgents = useStore((s) => s.setAgents);
  const setTasks = useStore((s) => s.setTasks);
  const addEvent = useStore((s) => s.addEvent);
  const updateTask = useStore((s) => s.updateTask);
  const updateAgentStatus = useStore((s) => s.updateAgentStatus);
  const addAgent = useStore((s) => s.addAgent);
  const removeAgent = useStore((s) => s.removeAgent);

  useEffect(() => {
    // Initialize Socket.io connection and event listeners
    const socket = initSocket();

    socket.on('chat:agents', (agents) => {
      setAgents(agents);
    });

    socket.on('chat:join', (agent) => {
      addAgent(agent);
      addEvent({ type: 'agent:join', agent, timestamp: Date.now() });
    });

    socket.on('chat:leave', ({ agentId }) => {
      removeAgent(agentId);
      addEvent({ type: 'agent:leave', agentId, timestamp: Date.now() });
    });

    socket.on('chat:status', ({ agentId, status, prevStatus, agent }) => {
      updateAgentStatus(agentId, status, agent);
      addEvent({ type: 'agent:status', agentId, status, prevStatus, timestamp: Date.now() });
    });

    socket.on('chat:message', (msg) => {
      addEvent({ type: 'message', ...msg });
    });

    socket.on('tasks:all', (tasks) => {
      setTasks(tasks);
    });

    socket.on('task:created', (task) => {
      addEvent({ type: 'task:created', task, timestamp: Date.now() });
    });

    socket.on('task:updated', (task) => {
      updateTask(task.id, task);
      addEvent({ type: 'task:updated', task, timestamp: Date.now() });
    });

    socket.on('task:progress', ({ taskId, progress }) => {
      updateTask(taskId, { progress });
    });

    return () => {
      socket.disconnect();
    };
  }, [setAgents, setTasks, addEvent, updateTask, updateAgentStatus, addAgent, removeAgent]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="agents" element={<Agents />} />
          <Route path="settings" element={<Settings />} />
          {/* Placeholder routes for Milestone 2 features */}
          <Route
            path="artifacts"
            element={
              <PlaceholderPage title="产物管理" description="Artifact 管理功能将在 Milestone 2 中实现，包括文件上传、版本管理、预览等功能。" icon="📦" />
            }
          />
          <Route
            path="meetings"
            element={
              <PlaceholderPage title="会议室" description="可视化会议室（Phaser 3 像素会议室）将在 Milestone 4 中实现。" icon="🎬" />
            }
          />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

/** Placeholder page for unimplemented routes */
function PlaceholderPage({ title, description, icon }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="text-center space-y-4 max-w-md">
        <span className="text-5xl">{icon}</span>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        <div className="text-xs text-gray-600">Milestone 1 范围外 · 敬请期待</div>
      </div>
    </div>
  );
}
