import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import Contacts from "./pages/Contacts";
import Calls from "./pages/Calls";
import Numbers from "./pages/Numbers";
import Meetings from "./pages/Meetings";
import Recall from "./pages/Recall";
import Analytics from "./pages/Analytics";
import Monitoring from "./pages/Monitoring";
import SettingsPage from "./pages/SettingsPage";
import AutoCall from "./pages/AutoCall";
import NotFound from "./pages/NotFound.tsx";
import EmailConfirm from "./pages/EmailConfirm";
import HelpChat from "./components/HelpChat";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/email-confirm" element={<EmailConfirm />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/campaigns" element={<Campaigns />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/calls" element={<Calls />} />
                  <Route path="/numbers" element={<Numbers />} />
                  <Route path="/meetings" element={<Meetings />} />
                  <Route path="/recall" element={<Recall />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/monitoring" element={<Monitoring />} />
                  <Route path="/auto-call" element={<AutoCall />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            <HelpChat />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
