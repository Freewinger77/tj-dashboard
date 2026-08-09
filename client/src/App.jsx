import { Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/layout/Shell.jsx';
import CustomersPage from './pages/Overview.jsx';
import ConversationPage from './pages/Conversation.jsx';
import StatsPage from './pages/Stats.jsx';
import SettingsPage from './pages/Settings.jsx';
import BookingCapturePage from './pages/BookingCapture.jsx';
import MeasurementPage from './pages/Measurement.jsx';

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<CustomersPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/measurement" element={<MeasurementPage />} />
        <Route path="/analytics" element={<Navigate to="/stats" replace />} />
        <Route path="/capture" element={<BookingCapturePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/customers/:phone" element={<ConversationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
