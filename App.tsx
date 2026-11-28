
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Schedule } from './pages/Schedule';
import { Homework } from './pages/Homework';
import { Journal } from './pages/Journal';
import { Messages } from './pages/Messages';
import { Library } from './pages/Library';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { Awards } from './pages/Awards';
import { Extra } from './pages/Extra';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Tutorial } from './components/Tutorial';
import { SplashScreen } from './components/SplashScreen';
import { InstallPrompt } from './components/InstallPrompt';
import { Surveys } from './pages/Surveys';
import { CongratulationsOverlay } from './components/CongratulationsOverlay';
import { SurveyModal } from './components/SurveyModal';
import { SurveyAutoGrader } from './components/SurveyAutoGrader';
import { SquwizSetup } from './components/SquwizSetup';
import { UsernameSetup } from './components/UsernameSetup';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Services } from './pages/Services';
import { Banners } from './pages/Banners';
import { Admin } from './pages/Admin';
import { Analytics } from './pages/Analytics';
import { ActivityTracker } from './components/ActivityTracker';
import { ThemeManager } from './components/ThemeManager';
import { TopNav } from './components/TopNav';
import { useActiveTheme, layoutOf } from './src/utils/theme';
import { Quran } from './pages/Quran';
import { Complaints } from './pages/Complaints';
import { Leagues } from './pages/Leagues';
import { ParentPortal } from './pages/ParentPortal';
import { BlockedScreen } from './components/BlockedScreen';
import { User } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, signInAnonymously, type Unsubscribe } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { isAdminUser, isStaffUser, isParentUser } from './src/utils/roles';
import { handleFirestoreError, OperationType } from './src/utils/firestoreError';
import { AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getUiLang, onUiLangChange, startRu, stopRu } from './src/utils/uiLang';

export default function App() {
  const [userBase, setUser] = useState<User | null>(null);
  const [uiLang, setUiLangState] = useState(getUiLang());
  useEffect(() => onUiLangChange(() => setUiLangState(getUiLang())), []);
  useEffect(() => { if (uiLang === 'ru') startRu(); else stopRu(); return () => stopRu(); }, [uiLang]);
  const user = useMemo(() => (userBase ? { ...userBase, language: 'ru' as const } : userBase), [userBase, uiLang]);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [errorState, setErrorState] = useState<null | 'no-profile' | 'network'>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showSquwizSetup, setShowSquwizSetup] = useState(false);
  const activeTheme = useActiveTheme();
  const topLayout = layoutOf(activeTheme) === 'top';
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('nav_collapsed') === '1'; } catch { return false; }
  });
  // The flat dark rail has a fixed width, so the collapsed state only applies to the classic theme.
  const navCollapsed = collapsed && activeTheme === 'classic';
  const toggleCollapsed = () => {
    setCollapsed(c => {
      try { localStorage.setItem('nav_collapsed', c ? '0' : '1'); } catch {}
      return !c;
    });
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
    sessionStorage.setItem('pwa_prompt_seen', 'true');
  };

  const handleCloseInstallPrompt = () => {
    setShowInstallPrompt(false);
    sessionStorage.setItem('pwa_prompt_seen', 'true');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 700); // Swift professional fade-in
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered', reg))
        .catch(err => console.error('SW registration failed', err));
    }
  }, []);

  // THEME ENGINE
  useEffect(() => {
    const root = window.document.documentElement;
    const themeColorMeta = document.getElementById('theme-color-meta');
    
    // The theme is managed by ThemeManager / theme.ts (data-theme). The Tailwind 'dark:' variants stay off:
    // the dark theme re-maps the colour scales instead.
    root.classList.remove('dark', 'cream');
    if (themeColorMeta) themeColorMeta.setAttribute('content', '#2f5224');
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const hasSeenPrompt = sessionStorage.getItem('pwa_prompt_seen');
      if (!hasSeenPrompt) setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    let docUnsub: Unsubscribe | null = null;
    let safetyTimeout: any = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthChecked(true);
      if (docUnsub) { docUnsub(); docUnsub = null; }
      if (safetyTimeout) clearTimeout(safetyTimeout);

      if (firebaseUser) {
        setLoading(true);
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        safetyTimeout = setTimeout(() => {
          if (loading) {
            setErrorState('no-profile');
            setLoading(false);
          }
        }, 10000);

        docUnsub = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            if (safetyTimeout) clearTimeout(safetyTimeout);
            const profile = { ...docSnap.data(), uid: docSnap.id, id: docSnap.id } as User;
            // Admin powers come from the e-mail (see roles.ts / firestore.rules). The stored role is never overwritten,
            // so the main administrator can also stay a regular student.
            setUser(profile);
            setErrorState(null);
            setLoading(false);
          }
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setErrorState('network');
            setLoading(false);
        });
      } else {
        // Check for SQUWIZ session
        const isSquwizLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (isSquwizLoggedIn) {
            const savedUser = localStorage.getItem('squwiz_user');
            if (savedUser) {
                // Ensure Firebase auth is also active for SQUWIZ users
                if (!auth.currentUser) {
                    signInAnonymously(auth).catch(err => console.error("SQUWIZ Firebase Auth failed:", err));
                }
                setUser(JSON.parse(savedUser) as User);
                setShowSquwizSetup(false);
            } else {
                // Show setup screen
                setShowSquwizSetup(true);
                setUser(null);
            }
            setLoading(false);
        } else {
            setUser(null);
            setLoading(false);
        }
      }
    });

    return () => {
      authUnsub();
      if (docUnsub) docUnsub();
      if (safetyTimeout) clearTimeout(safetyTimeout);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  if (errorState) {
      return (
          <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6 text-center z-[500]">
              <AlertCircle className="w-12 h-12 text-text mb-6" />
              <h2 className="text-2xl font-bold text-text tracking-tight ">Sistem Xətası</h2>
              <p className="text-muted mt-2 text-[10px] font-bold max-w-xs">İnternet bağlantısını yoxlayın və ya yenidən daxil olun.</p>
              <button onClick={() => window.location.reload()} className="mt-8 bg-brand text-white px-8 py-3 rounded-xl font-bold text-[10px] active:scale-95 transition-all">Yenidən yoxla</button>
              <button onClick={() => signOut(auth)} className="mt-4 text-muted font-bold text-[10px] hover:text-text transition-colors">Çıxış et</button>
          </div>
      );
  }

  if (!authChecked) return null;
  
  if (loading || showSplash) return <SplashScreen />;

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('squwiz_user');
    localStorage.removeItem('squwiz_token');
    signOut(auth);
  };

  const isUserBlocked = (u: User | null): boolean => {
    if (!u) return false;
    // Admins are never blocked
    if (isAdminUser(u)) return false;
    if (!u.isBlocked) return false;
    // If permanent ban or expiry date in future
    if (!u.blockedUntil) return true;
    return new Date(u.blockedUntil).getTime() > Date.now();
  };

  return (
    <HashRouter>
      <AnimatePresence mode="wait">
        {showInstallPrompt && (
          <InstallPrompt 
            onInstall={handleInstallClick} 
            onClose={handleCloseInstallPrompt} 
            />
        )}
        {!user ? (
          showSquwizSetup ? (
            <SquwizSetup onComplete={(userData) => {
              localStorage.setItem('squwiz_user', JSON.stringify(userData));
              setUser(userData as User);
              setShowSquwizSetup(false);
            }} />
          ) : (
            <Login key="login" />
          )
        ) : isUserBlocked(user) ? (
          <BlockedScreen user={user} onLogout={handleLogout} />
        ) : (
          <div 
            key="app" 
            className={`
              flex min-h-screen bg-background overflow-x-hidden relative
              ${user.highContrast ? 'contrast-125' : ''}
              ${user.compactMode ? 'text-[0.9em]' : ''}
            `}
          >
              <ThemeManager user={user} />
              <ActivityTracker user={user} />
              <Sidebar user={user} onLogout={handleLogout} collapsed={navCollapsed} onToggleCollapsed={toggleCollapsed} hideDesktop={topLayout} />
              {topLayout && <TopNav user={user} onLogout={handleLogout} />}
              
              {!user.username && !isParentUser(user) && <UsernameSetup user={user} />}

              {!isParentUser(user) && <Tutorial user={user} />}
              <CongratulationsOverlay user={user} />
              {!isParentUser(user) && <SurveyModal user={user} />}
              {!isParentUser(user) && <SurveyAutoGrader user={user} />}
              <main
                className={
                  topLayout
                    ? 'flex-1 min-w-0 pt-[72px] lg:pt-[96px] px-3 lg:px-6 pb-6 overflow-y-auto h-screen scroll-smooth custom-scrollbar'
                    : `flex-1 min-w-0 ${navCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[248px]'} transition-[margin] duration-300 px-4 lg:px-10 pb-6 pt-[72px] lg:pt-0 overflow-y-auto h-screen scroll-smooth custom-scrollbar`
                }
              >
                {topLayout ? (
                  <div className="minimal-shell">
                    <AnimatedRoutes user={user} />
                  </div>
                ) : (
                  <>
                    <TopBar user={user} />
                    <AnimatedRoutes user={user} />
                  </>
                )}
              </main>
          </div>
        )}
      </AnimatePresence>
    </HashRouter>
  );
}

function AnimatedRoutes({ user }: { user: User }) {
  const location = useLocation();
  return (
    <>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full page-stagger"
      >
        {isParentUser(user) ? (
          <Routes location={location}>
            <Route path="/parent-portal" element={<ParentPortal user={user} />} />
            <Route path="/settings" element={<Settings user={user} />} />
            <Route path="*" element={<Navigate to="/parent-portal" replace />} />
          </Routes>
        ) : (
        <Routes location={location}>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/schedule" element={<Schedule user={user} />} />
          <Route path="/homework" element={<Homework user={user} />} />
          <Route path="/journal" element={<ErrorBoundary><Journal currentUser={user} /></ErrorBoundary>} />
          <Route path="/library" element={<Library user={user} />} />
          <Route path="/quran" element={<Quran user={user} />} />
          <Route path="/knowledge-base" element={<KnowledgeBase user={user} />} />
          <Route path="/awards" element={<Awards user={user} />} />
          <Route path="/leagues" element={<Leagues user={user} />} />
          <Route path="/parent-portal" element={isStaffUser(user) ? <ParentPortal user={user} /> : <Navigate to="/" replace />} />
          <Route path="/extra" element={<Extra user={user} />} />
          <Route path="/messages" element={<Messages user={user} />} />
          <Route path="/surveys" element={<Surveys user={user} />} />
          <Route path="/complaints" element={<Complaints user={user} />} />
          <Route path="/settings" element={<Settings user={user} />} />
          <Route path="/profile" element={<Profile user={user} />} />
          <Route path="/services" element={<Services user={user} />} />
          <Route path="/banners" element={isStaffUser(user) ? <Banners user={user} /> : <Navigate to="/" replace />} />
          <Route path="/admin" element={isAdminUser(user) ? <Admin user={user} /> : <Navigate to="/" replace />} />
          <Route path="/analytics" element={isAdminUser(user) ? <Analytics user={user} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        )}
      </motion.div>
    </>
  );
}
