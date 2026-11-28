import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ref, onValue, onDisconnect, set, update, serverTimestamp as rtdbTime } from 'firebase/database';
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { rtdb, db } from '../firebase';
import { User } from '../types';

export const dayKey = (d: Date = new Date()): string => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time

/** "/homework" -> "homework", "/" -> "home" */
export const routeKey = (pathname: string): string => {
  const k = pathname.replace(/^\/+|\/+$/g, '').split('/')[0].toLowerCase().replace(/[^a-z0-9-]/g, '_');
  return k || 'home';
};

/**
 * Records activity so the administrator can see it in the analytics page:
 *  - realtime "online now" + current section (Realtime Database, presence/{uid})
 *  - last activity and login count (users/{uid})
 *  - one marker per user per day (activity_days/{day}/users/{uid})
 *  - section visit counters per day (activity_pages/{day})
 * Everything is best-effort: a failed write never affects the app.
 */
export const ActivityTracker: React.FC<{ user: User }> = ({ user }) => {
  const location = useLocation();
  const key = routeKey(location.pathname);
  const keyRef = useRef(key);
  keyRef.current = key;
  const lastCounted = useRef('');

  // Online now
  useEffect(() => {
    if (!user.uid) return;
    const myRef = ref(rtdb, `presence/${user.uid}`);
    const unsub = onValue(
      ref(rtdb, '.info/connected'),
      snap => {
        if (snap.val() !== true) return;
        onDisconnect(myRef).set({ state: 'offline', lastChanged: rtdbTime(), page: '' }).catch(() => {});
        set(myRef, { state: 'online', lastChanged: rtdbTime(), page: keyRef.current }).catch(() => {});
      },
      () => {}
    );
    return () => {
      unsub();
      set(myRef, { state: 'offline', lastChanged: rtdbTime(), page: '' }).catch(() => {});
    };
  }, [user.uid]);

  // Current section
  useEffect(() => {
    if (!user.uid) return;
    update(ref(rtdb, `presence/${user.uid}`), { page: key }).catch(() => {});
  }, [key, user.uid]);

  // Daily marker, last activity, login count
  useEffect(() => {
    if (!user.uid) return;
    const iso = new Date().toISOString();
    try {
      const day = dayKey();
      const dayFlag = `act_day_${user.uid}_${day}`;
      if (!sessionStorage.getItem(dayFlag)) {
        sessionStorage.setItem(dayFlag, '1');
        setDoc(
          doc(db, 'activity_days', day, 'users', user.uid),
          { uid: user.uid, name: user.name || '', role: user.role, at: iso },
          { merge: true }
        ).catch(() => {});
      }
      const sessionFlag = `act_session_${user.uid}`;
      if (!sessionStorage.getItem(sessionFlag)) {
        sessionStorage.setItem(sessionFlag, '1');
        updateDoc(doc(db, 'users', user.uid), { lastActiveAt: iso, lastLoginAt: iso, loginCount: increment(1) }).catch(() => {});
      }
    } catch {}

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateDoc(doc(db, 'users', user.uid), { lastActiveAt: new Date().toISOString() }).catch(() => {});
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user.uid]);

  // Section visit counter
  useEffect(() => {
    if (!user.uid || lastCounted.current === key) return;
    lastCounted.current = key;
    setDoc(doc(db, 'activity_pages', dayKey()), { total: increment(1), [`p_${key}`]: increment(1) }, { merge: true }).catch(() => {});
  }, [key, user.uid]);

  return null;
};
