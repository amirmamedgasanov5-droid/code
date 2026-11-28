import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Loader2, Wifi } from 'lucide-react';
import { collection, doc, getCountFromServer, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { onValue, ref } from 'firebase/database';
import { db, rtdb } from '../firebase';
import { Role, User } from '../types';
import { dayKey } from '../components/ActivityTracker';

const ROLE_LABEL: Record<Role, string> = { student: 'Tələbə', teacher: 'Müəllim', admin: 'İdarəçi', parent: 'Valideyn' };

const SECTION_LABEL: Record<string, string> = {
  home: 'Ana səhifə',
  schedule: 'Dərs cədvəli',
  homework: 'Tapşırıqlar',
  journal: 'Jurnal',
  library: 'Kitabxana',
  quran: 'Qurani-Kərim',
  'knowledge-base': 'Bilik bazası',
  extra: 'Digər bölmələr',
  leagues: 'Liqa',
  awards: 'Mükafatlar',
  'parent-portal': 'Valideyn kabineti',
  surveys: 'Sorğular',
  complaints: 'İntizam',
  messages: 'Mesajlar',
  services: 'Xidmətlər',
  settings: 'Tənzimləmələr',
  profile: 'Profil',
  banners: 'Bannerlər',
  admin: 'İdarə paneli',
  analytics: 'Analitika',
};

interface Presence {
  state?: string;
  lastChanged?: number;
  page?: string;
}

interface Stats {
  daily: { day: string; count: number }[];
  sections: { key: string; count: number }[];
  content: { label: string; value: number }[];
}

const timeAgo = (iso?: string): string => {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'indi';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat əvvəl`;
  const d = Math.floor(h / 24);
  return `${d} gün əvvəl`;
};

const daysAgo = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

export const Analytics: React.FC<{ user: User }> = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [presenceError, setPresenceError] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'week' | 'passive'>('all');
  const [, setTick] = useState(0);

  // Users (live)
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users'),
        snap => setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id, id: d.data().id || d.id } as User))),
        err => console.error('users listener:', err)
      ),
    []
  );

  // Online now (live)
  useEffect(
    () =>
      onValue(
        ref(rtdb, 'presence'),
        snap => {
          setPresence((snap.val() as Record<string, Presence>) || {});
          setPresenceError(false);
        },
        () => setPresenceError(true)
      ),
    []
  );

  // Re-render every minute so "x min ago" stays fresh
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setStatsError('');
    try {
      // Daily active users, last 14 days
      const days = Array.from({ length: 14 }, (_, i) => dayKey(daysAgo(13 - i)));
      const daily = await Promise.all(
        days.map(async day => {
          const c = await getCountFromServer(collection(db, 'activity_days', day, 'users'));
          return { day, count: c.data().count };
        })
      );

      // Most visited sections, last 7 days
      const last7 = Array.from({ length: 7 }, (_, i) => dayKey(daysAgo(i)));
      const pageDocs = await Promise.all(last7.map(d => getDoc(doc(db, 'activity_pages', d))));
      const totals: Record<string, number> = {};
      pageDocs.forEach(p => {
        if (!p.exists()) return;
        Object.entries(p.data()).forEach(([k, v]) => {
          if (k.startsWith('p_') && typeof v === 'number') totals[k.slice(2)] = (totals[k.slice(2)] || 0) + v;
        });
      });
      const sections = Object.entries(totals)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Learning activity
      const since = daysAgo(7).toISOString();
      const count = async (q: ReturnType<typeof query>) => (await getCountFromServer(q)).data().count;
      const [subs, exams, hw, complaints] = await Promise.all([
        count(query(collection(db, 'submissions'), where('submittedAt', '>=', since))),
        count(query(collection(db, 'exam_submissions'), where('submittedAt', '>=', since))),
        count(query(collection(db, 'homeworks'), where('status', '==', 'active'))),
        count(query(collection(db, 'complaints'), where('status', '==', 'active'))),
      ]);

      setStats({
        daily,
        sections,
        content: [
          { label: 'Təhvil verilən tapşırıqlar (7 gün)', value: subs },
          { label: 'İmtahan cəhdləri (7 gün)', value: exams },
          { label: 'Aktiv tapşırıqlar', value: hw },
          { label: 'Aktiv intizam qeydləri', value: complaints },
        ],
      });
    } catch (err: any) {
      setStatsError(err?.message || 'Statistika yüklənmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const byUid = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach(u => (m[u.uid] = u));
    return m;
  }, [users]);

  const onlineEntries = useMemo(
    () =>
      Object.entries(presence)
        .filter(([, p]) => p?.state === 'online')
        .map(([uid, p]) => ({ uid, page: p.page || '', since: p.lastChanged || 0, user: byUid[uid] })),
    [presence, byUid]
  );

  const onlineByRole = useMemo(() => {
    const r: Record<string, number> = {};
    onlineEntries.forEach(e => {
      const role = e.user?.role || 'unknown';
      r[role] = (r[role] || 0) + 1;
    });
    return r;
  }, [onlineEntries]);

  const now = Date.now();
  const activeWithin = (ms: number) => users.filter(u => u.lastActiveAt && now - new Date(u.lastActiveAt).getTime() <= ms).length;
  const withData = users.filter(u => u.lastActiveAt).length;
  const today = stats?.daily[stats.daily.length - 1]?.count ?? 0;

  const isOnline = (uid: string) => presence[uid]?.state === 'online';
  const isWeekActive = (u: User) => !!u.lastActiveAt && now - new Date(u.lastActiveAt).getTime() <= 7 * 86400000;

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => {
        if (filter === 'online') return isOnline(u.uid);
        if (filter === 'week') return isWeekActive(u);
        if (filter === 'passive') return !isWeekActive(u);
        return true;
      })
      .filter(u => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))
      .sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, presence, search, filter]);

  const maxDaily = Math.max(1, ...(stats?.daily.map(d => d.count) || [1]));
  const maxSection = Math.max(1, ...(stats?.sections.map(s => s.count) || [1]));

  const tabs: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'Hamısı' },
    { id: 'online', label: 'Onlayn' },
    { id: 'week', label: '7 gündə aktiv' },
    { id: 'passive', label: 'Passiv' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Analitika</h1>
          <p className="text-xs text-muted mt-0.5">Kim daxil olur, kim indi onlaynıdır, nə ilə məşğul olurlar.</p>
        </div>
        <button onClick={loadStats} disabled={loading} className="btn-secondary self-start sm:self-auto disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Yenilə</span>
        </button>
      </div>

      {(statsError || presenceError) && (
        <div className="card !p-4 border-red-200 bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300 space-y-1">
          {presenceError && <p>Onlayn məlumatı oxunmur. Realtime Database qaydalarını (database.rules.json) dərc edin.</p>}
          {statsError && <p>Statistika oxunmur: {statsError}. Firestore qaydalarını (firestore.rules) dərc edin.</p>}
        </div>
      )}

      {withData < Math.max(1, Math.ceil(users.length / 2)) && (
        <div className="card !p-4 text-xs text-muted">
          Aktivlik məlumatı bu yenilənmədən sonra yığılmağa başlayıb. İstifadəçilər sayta daxil olduqca rəqəmlər dolacaq; keçmiş aktivlik göstərilmir.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card !p-4 col-span-2 lg:col-span-1 border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/10">
          <div className="flex items-center gap-1.5 text-xs text-muted"><Wifi className="w-3.5 h-3.5 text-green-600" /> İndi onlayn</div>
          <div className="text-3xl font-semibold text-text mt-1">{onlineEntries.length}</div>
          <div className="text-[11px] text-muted mt-1">
            {Object.entries(onlineByRole).map(([r, n]) => `${ROLE_LABEL[r as Role] || 'Naməlum'}: ${n}`).join(' · ') || '—'}
          </div>
        </div>
        {[
          { label: 'Bu gün aktiv', value: today },
          { label: '7 gündə aktiv', value: activeWithin(7 * 86400000) },
          { label: '30 gündə aktiv', value: activeWithin(30 * 86400000) },
          { label: 'Cəmi istifadəçi', value: users.length },
        ].map(k => (
          <div key={k.label} className="card !p-4">
            <div className="text-xs text-muted">{k.label}</div>
            <div className="text-3xl font-semibold text-text mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Online now */}
        <section className="card !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-text">İndi onlayn olanlar</div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto custom-scrollbar">
            {onlineEntries.length === 0 && <div className="p-8 text-center text-xs text-muted">Hazırda heç kim onlayn deyil</div>}
            {onlineEntries.map(e => (
              <div key={e.uid} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text truncate">{e.user?.name || 'Naməlum istifadəçi'}</div>
                    <div className="text-[11px] text-muted">{e.user ? ROLE_LABEL[e.user.role] : '—'}{e.user?.className ? ` · ${e.user.className}` : ''}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-brand-600 dark:text-brand-400">{SECTION_LABEL[e.page] || e.page || '—'}</div>
                  <div className="text-[11px] text-muted">{e.since ? timeAgo(new Date(e.since).toISOString()) : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top sections */}
        <section className="card !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-text">Ən çox açılan bölmələr (7 gün)</div>
          <div className="p-5 space-y-3">
            {!stats || stats.sections.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted">Hələ məlumat yoxdur</div>
            ) : (
              stats.sections.map(s => (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text">{SECTION_LABEL[s.key] || s.key}</span>
                    <span className="text-muted">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-brand-100 dark:bg-brand-950 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${(s.count / maxSection) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Daily active users */}
      <section className="card !p-5 space-y-4">
        <div className="text-sm font-semibold text-text">Gündəlik aktiv istifadəçilər (14 gün)</div>
        {!stats ? (
          <div className="py-10 text-center text-xs text-muted">{loading ? 'Yüklənir...' : 'Məlumat yoxdur'}</div>
        ) : (
          <div className="flex items-end gap-1.5 sm:gap-2 h-44">
            {stats.daily.map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 min-w-0">
                <span className="text-[11px] text-muted">{d.count}</span>
                <div
                  className="w-full rounded-t-lg bg-brand-600"
                  style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%`, opacity: d.count === 0 ? 0.25 : 1 }}
                  title={`${d.day}: ${d.count}`}
                />
                <span className="text-[10px] text-muted">{d.day.slice(8, 10)}.{d.day.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Learning activity */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.content.map(c => (
            <div key={c.label} className="card !p-4">
              <div className="text-2xl font-semibold text-text">{c.value}</div>
              <div className="text-xs text-muted mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      <section className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap border transition-colors ${
                  filter === t.id ? 'bg-brand-600 border-brand-600 text-white' : 'bg-surface border-border text-muted hover:text-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ad, e-poçt və ya istifadəçi adı"
              className="pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 w-full md:w-72"
            />
          </div>
        </div>

        <div className="card !p-0 overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 px-5 py-2.5 border-b border-border text-[11px] font-medium text-muted">
            <span className="col-span-5">İstifadəçi</span>
            <span className="col-span-2">Rol</span>
            <span className="col-span-3">Son aktivlik</span>
            <span className="col-span-2 text-right">Giriş sayı</span>
          </div>
          <div className="divide-y divide-border">
            {list.length === 0 && <div className="p-8 text-center text-xs text-muted">İstifadəçi tapılmadı</div>}
            {list.map(u => (
              <div key={u.uid} className="px-5 py-3 grid grid-cols-12 gap-2 items-center text-xs">
                <div className="col-span-12 sm:col-span-5 flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline(u.uid) ? 'bg-green-500' : isWeekActive(u) ? 'bg-amber-400' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text truncate">{u.name}</div>
                    <div className="text-[11px] text-muted truncate">{u.email}</div>
                  </div>
                </div>
                <span className="col-span-4 sm:col-span-2 text-muted">{ROLE_LABEL[u.role] || u.role}</span>
                <span className="col-span-5 sm:col-span-3 text-muted">{isOnline(u.uid) ? 'İndi onlayn' : timeAgo(u.lastActiveAt)}</span>
                <span className="col-span-3 sm:col-span-2 text-right text-text">{u.loginCount ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted">
          Yaşıl nöqtə — onlayn, sarı — son 7 gündə aktiv, boz — passiv və ya məlumat hələ yoxdur.
        </p>
      </section>
    </div>
  );
};
