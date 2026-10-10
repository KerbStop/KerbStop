import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { Layout } from './components/Layout';
import { BookingPage } from './pages/BookingPage';
import { ChargerDetailPage } from './pages/ChargerDetailPage';
import { ChargersPage } from './pages/ChargersPage';
import { ChargingPage } from './pages/ChargingPage';
import { BrowsePreviewPage } from './pages/BrowsePreviewPage';
import { HomePage } from './pages/HomePage';
import { HostDashboardPage } from './pages/HostDashboardPage';
import { HostCalendarPage } from './pages/HostCalendarPage';
import { HostPage } from './pages/HostPage';
import { ReceiptPage } from './pages/ReceiptPage';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/browse" element={<BrowsePreviewPage />} />
          <Route path="/chargers" element={<ChargersPage />} />
          <Route path="/chargers/:id" element={<ChargerDetailPage />} />
          <Route path="/booking/:id" element={<BookingPage />} />
          <Route path="/charging/:id" element={<ChargingPage />} />
          <Route path="/receipt/:id" element={<ReceiptPage />} />
          <Route path="/host" element={<HostPage />} />
          <Route path="/host/dashboard" element={<HostDashboardPage />} />
          <Route path="/host/calendar" element={<HostCalendarPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
