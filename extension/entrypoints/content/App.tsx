import { useSyncExternalStore } from 'react';
import { getInspection, setInspection, subscribe } from './store';
import { Inspector } from './Inspector';

export function App() {
  const inspection = useSyncExternalStore(subscribe, getInspection, getInspection);
  if (!inspection) return null;
  return <Inspector inspection={inspection} onClose={() => setInspection(null)} />;
}
