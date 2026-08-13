import { Routes, Route, Navigate } from 'react-router-dom';
import AuthGate from './components/AuthGate.jsx';
import Shell from './components/layout/Shell.jsx';
import TodayPage from './pages/Today.jsx';
import ConversationsPage from './pages/Overview.jsx';
import ConversationPage from './pages/Conversation.jsx';
import PerformancePage from './pages/Performance.jsx';
import ControlsPage from './pages/Controls.jsx';
import BookingCapturePage from './pages/BookingCapture.jsx';

export default function App() {
  return (
    <AuthGate>
      <Shell>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/conversations" element={<ConversationsPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/controls" element={<ControlsPage />} />
          <Route path="/capture" element={<BookingCapturePage />} />
          <Route path="/customers/:phone" element={<ConversationPage />} />

          {/* Legacy redirects */}
          <Route path="/stats" element={<Navigate to="/performance" replace />} />
          <Route path="/analytics" element={<Navigate to="/performance" replace />} />
          <Route
            path="/measurement"
            element={<Navigate to="/performance?method=incremental" replace />}
          />
          <Route path="/settings" element={<Navigate to="/controls" replace />} />
          <Route path="/customers" element={<Navigate to="/conversations" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthGate>
  );
}
