import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { cloud } from './lib/backend';
import { FleetProvider } from './lib/fleet';
import { Layout } from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Machines } from './pages/Machines';
import { MachineDetail } from './pages/MachineDetail';
import { MachineForm } from './pages/MachineForm';
import { ServiceList } from './pages/ServiceList';
import { ServiceNew } from './pages/ServiceNew';
import { ServiceDetail } from './pages/ServiceDetail';
import { Rental } from './pages/Rental';
import { SettingsPage } from './pages/Settings';
import { Login } from './pages/Login';

export default function App() {
  const [ready, setReady] = useState(!cloud);
  const [authed, setAuthed] = useState(!cloud);

  useEffect(() => {
    if (!cloud) return;
    cloud.init().then((s) => {
      setAuthed(!!s);
      setReady(true);
    });
    const { data } = cloud.client.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <Spinner />;

  return (
    <ToastProvider>
      {!authed ? (
        <Login onLoggedIn={() => setAuthed(true)} />
      ) : (
        <FleetProvider>
          {/* HashRouter funguje všude: web, PWA, Capacitor (Android/iOS) i ze souboru */}
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="stroje" element={<Machines />} />
                <Route path="stroje/novy" element={<MachineForm />} />
                <Route path="stroje/:id" element={<MachineDetail />} />
                <Route path="stroje/:id/upravit" element={<MachineForm />} />
                <Route path="servis" element={<ServiceList />} />
                <Route path="servis/novy" element={<ServiceNew />} />
                <Route path="servis/:id" element={<ServiceDetail />} />
                <Route path="pujcovna" element={<Rental />} />
                <Route path="nastaveni" element={<SettingsPage />} />
                <Route path="*" element={<Dashboard />} />
              </Route>
            </Routes>
          </HashRouter>
        </FleetProvider>
      )}
    </ToastProvider>
  );
}
