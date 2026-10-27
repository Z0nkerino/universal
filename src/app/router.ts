import { create } from 'zustand';

export type Route = 'today' | 'calendar' | 'notes' | 'ideas' | 'health' | 'insights' | 'afina' | 'settings' | 'design';

const ROUTES: Route[] = ['today', 'calendar', 'notes', 'ideas', 'health', 'insights', 'afina', 'settings', 'design'];

function fromHash(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('/')[0] as Route;
  return ROUTES.includes(h) ? h : 'today';
}

interface RouterState {
  route: Route;
  /** `sub` deep-links inside a page, e.g. go('settings', 'connectors'). */
  go: (r: Route, sub?: string) => void;
}

export const useRouter = create<RouterState>((set) => ({
  route: fromHash(),
  go: (route, sub) => {
    const hash = `#/${route}${sub ? `/${sub}` : ''}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
    set({ route });
    if (sub) dispatchEvent(new Event('up:subroute'));
  },
}));

const sync = () => useRouter.getState().route !== fromHash() && useRouter.setState({ route: fromHash() });
addEventListener('popstate', sync);
addEventListener('hashchange', sync);
