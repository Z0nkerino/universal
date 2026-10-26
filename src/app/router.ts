import { create } from 'zustand';

export type Route = 'today' | 'calendar' | 'notes' | 'ideas' | 'health' | 'insights' | 'afina' | 'settings' | 'design';

const ROUTES: Route[] = ['today', 'calendar', 'notes', 'ideas', 'health', 'insights', 'afina', 'settings', 'design'];

function fromHash(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('/')[0] as Route;
  return ROUTES.includes(h) ? h : 'today';
}

interface RouterState {
  route: Route;
  go: (r: Route) => void;
}

export const useRouter = create<RouterState>((set) => ({
  route: fromHash(),
  go: (route) => {
    if (location.hash !== `#/${route}`) history.pushState(null, '', `#/${route}`);
    set({ route });
  },
}));

const sync = () => useRouter.getState().route !== fromHash() && useRouter.setState({ route: fromHash() });
addEventListener('popstate', sync);
addEventListener('hashchange', sync);
