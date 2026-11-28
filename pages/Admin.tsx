import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, ShieldCheck, UserCheck, Database, Check, KeyRound, Copy, Trash2, UserPlus } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, onSnapshot, updateDoc, doc, setDoc, getDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Role, User, ParentInvite } from '../types';
import { ADMIN_EMAIL, isAdminUser } from '../src/utils/roles';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { Toast, ToastType } from '../components/Toast';

const ROLE_LABEL: Record<Role, string> = { student: 'Tələbə', teacher: 'Müəllim', admin: 'İdarəçi', parent: 'Valideyn' };

export const Admin: React.FC<{ user: User }> = ({ user }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'requests' | Role>('all');
  const [seeding, setSeeding] = useState(false);
  const [invites, setInvites] = useState<ParentInvite[]>([]);
  const [lastCode, setLastCode] = useState<{ code: string; student: string } | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'users')),
      snap => {
        setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id, id: d.data().id || d.id } as User)));
        setLoading(false);
      },
      err => {
        setLoading(false);
        console.error('users listener:', err);
      }
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'parent_invites'), where('used', '==', false)),
      snap => setInvites(snap.docs.map(d => ({ ...d.data(), id: d.id } as ParentInvite)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))),
      err => console.error('invites listener:', err)
    );
  }, []);

  const requests = useMemo(() => users.filter(u => u.requestedRole === 'teacher' && u.role === 'student'), [users]);

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter(u => u.role === 'student').length,
      teacher: users.filter(u => u.role === 'teacher').length,
      admin: users.filter(u => isAdminUser(u)).length,
      parent: users.filter(u => u.role === 'parent').length,
    }),
    [users]
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => {
        if (filter === 'requests') return u.requestedRole === 'teacher' && u.role === 'student';
        if (filter !== 'all') return u.role === filter;
        return true;
      })
      .filter(u => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, search, filter]);

  const notify = (message: string, type: ToastType = 'success') => setToast({ visible: true, message, type });

  const changeRole = async (target: User, role: Role) => {
    try {
      await updateDoc(doc(db, 'users', target.uid), { role, requestedRole: null });
      notify(`${target.name}: ${ROLE_LABEL[role]}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
      notify('Rol dəyişdirilmədi', 'error');
    }
  };

  const resetPassword = async (target: User) => {
    if (!target.email) {
      notify('Bu istifadəçinin e-poçtu yoxdur', 'error');
      return;
    }
    if (!window.confirm(`Отправить ссылку для сброса пароля на ${target.name} (${target.email})?`)) return;
    try {
      await sendPasswordResetEmail(auth, target.email);
      notify(`Ссылка отправлена: ${target.email}`);
    } catch (err: any) {
      notify('Link göndərilmədi: ' + (err?.message || 'xəta'), 'error');
    }
  };

  const makeCode = () => {
    // No look-alike characters (0/O, 1/I)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  };

  const createInvite = async (student: User) => {
    try {
      const code = makeCode();
      await setDoc(doc(db, 'parent_invites', code), {
        studentUid: student.uid,
        studentName: student.name,
        used: false,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      setLastCode({ code, student: student.name });
      notify('Valideyn kodu yaradıldı');
    } catch (err: any) {
      notify('Kod yaradılmadı: ' + (err?.message || 'xəta'), 'error');
    }
  };

  const removeInvite = async (code: string) => {
    if (!window.confirm('Bu kod silinsin?')) return;
    try {
      await deleteDoc(doc(db, 'parent_invites', code));
    } catch (err: any) {
      notify('Silinmədi: ' + (err?.message || 'xəta'), 'error');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Kopyalandı');
    } catch {
      notify('Kopyalamaq alınmadı, kodu əl ilə köçürün', 'error');
    }
  };

  const rejectRequest = async (target: User) => {
    try {
      await updateDoc(doc(db, 'users', target.uid), { requestedRole: null });
      notify('Sorğu rədd edildi');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  // Creates the first documents so the collections exist in the Firebase console.
  const seed = async () => {
    setSeeding(true);
    try {
      const settingsRef = doc(db, 'school_settings', 'main');
      if (!(await getDoc(settingsRef)).exists()) {
        await setDoc(settingsRef, {
          schoolName: 'İsnad Mədrəsəsi',
          adminEmail: ADMIN_EMAIL,
          createdAt: new Date().toISOString(),
        });
      }
      await addDoc(collection(db, 'banners'), {
        title: 'İsnad Mədrəsəsinə xoş gəlmisiniz',
        text: 'Yeni tədris ilində hamıya uğurlar. Bu banneri «Bannerlər» bölməsindən dəyişə və ya silə bilərsiniz.',
        imageUrl: '',
        linkUrl: '',
        linkLabel: '',
        tone: 'indigo',
        active: true,
        authorId: user.uid,
        authorName: user.name,
        createdAt: new Date().toISOString(),
      });
      notify('İlkin məlumatlar yaradıldı: banners, school_settings');
    } catch (err: any) {
      notify('Xəta: ' + (err?.message || 'yaradıla bilmədi'), 'error');
    } finally {
      setSeeding(false);
    }
  };

  const tabs: { id: typeof filter; label: string; n?: number }[] = [
    { id: 'all', label: 'Hamısı', n: counts.all },
    { id: 'requests', label: 'Müəllim sorğuları', n: requests.length },
    { id: 'teacher', label: 'Müəllimlər', n: counts.teacher },
    { id: 'student', label: 'Tələbələr', n: counts.student },
    { id: 'parent', label: 'Valideynlər', n: counts.parent },
    { id: 'admin', label: 'İdarəçilər', n: counts.admin },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Yalnız idarəçi</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text">İdarə paneli</h1>
          <p className="text-xs text-muted mt-0.5">İstifadəçilər, rollar və müəllim sorğuları.</p>
        </div>
        <button onClick={seed} disabled={seeding} className="btn-secondary self-start sm:self-auto disabled:opacity-50">
          {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
          <span>İlkin məlumatları yarat</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Cəmi istifadəçi', value: counts.all },
          { label: 'Tələbə', value: counts.student },
          { label: 'Müəllim', value: counts.teacher },
          { label: 'Gözləyən sorğu', value: requests.length },
        ].map(k => (
          <div key={k.label} className="card !p-4">
            <div className="text-2xl font-semibold text-text">{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {requests.length > 0 && filter !== 'requests' && (
        <button
          onClick={() => setFilter('requests')}
          className="w-full text-left card !p-4 flex items-center gap-3 border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/20"
        >
          <UserCheck className="w-4 h-4 text-brand-600" />
          <span className="text-sm text-text">{requests.length} nəfər müəllim olmaq istəyir. Baxmaq üçün klikləyin.</span>
        </button>
      )}

      {lastCode && (
        <div className="card !p-5 border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted">{lastCode.student} üçün valideyn kodu (bir dəfəlik):</p>
            <p className="text-2xl font-semibold tracking-[0.3em] text-brand-700 dark:text-brand-300 mt-1 select-all">{lastCode.code}</p>
            <p className="text-[11px] text-muted mt-1">Valideynə verin. O, «Qeydiyyat → Valideyn» bölməsində kodu yazıb özü şifrə təyin edir.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => copy(lastCode.code)} className="btn-primary"><Copy className="w-3.5 h-3.5" /><span>Kopyala</span></button>
            <button onClick={() => setLastCode(null)} className="btn-secondary">Bağla</button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-text">Aktiv valideyn kodları <span className="text-muted font-normal">({invites.length})</span></div>
          <div className="divide-y divide-border">
            {invites.map(inv => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-semibold tracking-widest text-sm text-text">{inv.id}</span>
                  <span className="text-xs text-muted ml-3 truncate">{inv.studentName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => copy(inv.id)} className="btn-secondary !px-3 !py-1.5"><Copy className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeInvite(inv.id)} className="btn-secondary !px-3 !py-1.5 !text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {t.label} <span className="opacity-70">{t.n}</span>
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

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden divide-y divide-border">
          {list.length === 0 && <div className="p-8 text-center text-xs text-muted">İstifadəçi tapılmadı</div>}
          {list.map(u => {
            const isMain = (u.email || '').toLowerCase() === ADMIN_EMAIL;
            const wantsTeacher = u.requestedRole === 'teacher' && u.role === 'student';
            return (
              <div key={u.uid} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
                    {u.photoURL || u.avatar ? <img src={u.photoURL || u.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (u.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text truncate">{u.name}</span>
                      {wantsTeacher && <span className="text-[11px] px-2 py-0.5 rounded-md bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">Müəllim sorğusu</span>}
                      {u.isBlocked && <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-600">Bloklanıb</span>}
                    </div>
                    <div className="text-[11px] text-muted truncate">{u.email}{u.className ? ` · ${u.className}` : ''}{u.username ? ` · @${u.username}` : ''}{u.role === 'parent' && u.childName ? ` · Ребёнок: ${u.childName}` : ''}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {u.role === 'student' && (
                    <button onClick={() => createInvite(u)} className="btn-secondary !px-3 !py-1.5" title="Valideyn üçün bir dəfəlik kod">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Valideyn kodu</span>
                    </button>
                  )}
                  {u.email && (
                    <button onClick={() => resetPassword(u)} className="btn-secondary !px-3 !py-1.5" title="Şifrə yeniləmə linki göndər">
                      <KeyRound className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Şifrə sıfırla</span>
                    </button>
                  )}
                  {wantsTeacher && (
                    <>
                      <button onClick={() => changeRole(u, 'teacher')} className="btn-primary !px-3 !py-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Təsdiq et</span>
                      </button>
                      <button onClick={() => rejectRequest(u)} className="btn-secondary !px-3 !py-1.5">Rədd et</button>
                    </>
                  )}
                  {isMain && <span className="text-xs text-brand-600 font-medium px-1">Baş idarəçi</span>}
                  <select
                    value={u.role}
                    onChange={e => changeRole(u, e.target.value as Role)}
                    className="text-xs bg-surface border border-border rounded-xl px-3 py-2 outline-none text-text"
                    title={isMain ? 'İdarəçi hüququ e-poçtla verilir, rol dəyişsə də itmir' : undefined}
                  >
                    {(Object.keys(ROLE_LABEL) as Role[])
                      .filter(r => r !== 'parent' || u.role === 'parent')
                      .map(r => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
