import React, { useState, useEffect } from 'react';
import { Navbar, type ViewKey } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HomepageView } from '@/views/HomepageView';
import { LiveTrainingView } from '@/views/LiveTrainingView';
import { ReviewView } from '@/views/ReviewView';

type AppView = ViewKey | 'stage';
const VIEWS: AppView[] = ['home', 'live', 'review', 'stage'];

export function App() {
  // The homepage stays the default. Old stage links enter the one Live exercise.
  const [view, setView] = useState<ViewKey>(() => {
    const requested = new URLSearchParams(window.location.search).get('view') as AppView | null;
    if (requested === 'stage') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'live');
      window.history.replaceState({}, '', url);
      return 'live';
    }
    return requested && VIEWS.includes(requested) ? requested : 'home';
  });
  const [initialTime, setInitialTime] = useState<number>(0);
  const [initialJury, setInitialJury] = useState<boolean>(true);

  // Initialize from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tParam = parseFloat(params.get('t') || '0');
    const juryParam = params.get('jury') === '1' || params.get('jury') === 'true';

    if (tParam > 0) {
      setInitialTime(tParam);
    }
    if (juryParam) {
      setInitialJury(true);
    }
  }, []);

  const handleNavigate = (newView: ViewKey, params?: { t?: number; jury?: boolean }) => {
    setView(newView);
    if (params?.t !== undefined) {
      setInitialTime(params.t);
    }
    if (params?.jury !== undefined) {
      setInitialJury(params.jury);
    }

    // URL 同步
    const url = new URL(window.location.href);
    url.searchParams.set('view', newView);
    if (params?.t !== undefined) {
      url.searchParams.set('t', params.t.toString());
      url.searchParams.set('mode', 'replay');
    } else {
      url.searchParams.delete('t');
      url.searchParams.delete('mode');
    }
    if (params?.jury !== undefined) {
      url.searchParams.set('jury', params.jury ? '1' : '0');
    } else {
      url.searchParams.delete('jury');
    }
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-ground text-ink selection:bg-held-tint selection:text-ink font-ui antialiased">
      <Navbar currentView={view} onSelectView={(v) => handleNavigate(v)} />

      <div className="flex-1">
        {view === 'home' && <HomepageView onNavigate={handleNavigate} />}
        {view === 'live' && (
          <LiveTrainingView
            key={`live-${initialTime}-${initialJury}`}
            initialTime={initialTime}
            initialJury={initialJury}
            onNavigate={handleNavigate}
          />
        )}
        {view === 'review' && <ReviewView onNavigate={handleNavigate} />}
      </div>

      <Footer onSelectView={(v) => handleNavigate(v)} />
    </div>
  );
}

export default App;
