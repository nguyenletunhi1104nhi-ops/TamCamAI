import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";
import ProtectedRoute from "./ProtectedRoute";

import Login from "../pages/Login/Login";
import Register from "../pages/Register/Register";

const Dashboard = lazy(() => import("../pages/Dashboard/Dashboard"));
const UploadDocument = lazy(() => import("../pages/UploadDocument/UploadDocument"));
const AIAnalysis = lazy(() => import("../pages/AIAnalysis/AIAnalysis"));
const AnalysisResult = lazy(() => import("../pages/AnalysisResult/AnalysisResult"));
const Task = lazy(() => import("../pages/Task/Task"));
const Calendar = lazy(() => import("../pages/Calendar/Calendar"));
const Chat = lazy(() => import("../pages/Chat/Chat"));
const Analytics = lazy(() => import("../pages/Analytics/Analytics"));
const Profile = lazy(() => import("../pages/Profile/Profile"));
const Settings = lazy(() => import("../pages/Settings/Settings"));
const HealthCheck = lazy(() => import("../pages/HealthCheck/HealthCheck"));
const CreateTask = lazy(() => import("../pages/CreateTask/CreateTask"));
const TaskDetail = lazy(() => import("../pages/TaskDetail/TaskDetail"));
const EditTask = lazy(() => import("../pages/EditTask/EditTask"));

function PageLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center text-sm font-semibold text-pink-500">
      Đang tải trang...
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageLoading />}>
              <MainLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<UploadDocument />} />
        <Route path="/analysis" element={<AIAnalysis />} />
        <Route path="/analysis-result" element={<AnalysisResult />} />
        <Route path="/tasks" element={<Task />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/health" element={<HealthCheck />} />
        <Route path="/create-task" element={<CreateTask />} />
        <Route path="/task/:id" element={<TaskDetail />} />
        <Route path="/task/:id/edit" element={<EditTask />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
