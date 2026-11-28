
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Mail, Hash, Shield, GraduationCap, Camera, Loader2, Users, User as UserIcon, QrCode, X, Bookmark, Printer, Download } from 'lucide-react';
import { translations } from '../i18n';
import { uploadImageToImgBB } from '../src/utils/imgbb';
import { db } from '../firebase';
import { doc, updateDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { StudentIDCard } from '../components/StudentIDCard';

interface ProfileProps {
  user: User;
}

const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserForCard, setSelectedUserForCard] = useState<User | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as User)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    return () => unsub();
  }, []);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-brand" /></div>;

  return (
    <div className="space-y-6 mt-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-white font-semibold border-2 border-brand-200">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-text">Sistemdəki Tələbələr & Müəllimlər</h2>
            <p className="text-xs font-semibold text-muted">İstifadəçilərin rəsmi vəsiqələrinə baxış və çap</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {users.map(u => (
          <div key={u.uid} className="bg-surface p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-brand-200 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-950 border-2 border-brand-200 flex items-center justify-center text-brand-200 font-semibold text-xl overflow-hidden">
                {u.photoURL ? <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : u.name.charAt(0)}
              </div>
              <div>
                <p className="text-base font-semibold text-text tracking-tight">{u.name}</p>
                <p className="text-xs text-muted tabular-nums font-semibold">@{u.username || 'user'}</p>
                <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold ${u.role === 'teacher' ? 'bg-brand-100 text-brand-700' : 'bg-brand-500 text-white'}`}>
                  {u.role === 'teacher' ? 'Müəllim' : 'Şagird'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setSelectedUserForCard(u)}
                className="px-4 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs border-brand-200 transition-all flex items-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                <span>Vəsiqəyə bax</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal for viewing any user's 3D ID-Card */}
      {selectedUserForCard && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl shadow-md p-6 sm:p-7 space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center font-medium">
                                  </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                    Rəsmi Tələbə Vəsiqəsi
                  </h3>
                  <p className="text-xs text-neutral-500">{selectedUserForCard.name}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedUserForCard(null)}
                className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <StudentIDCard user={selectedUserForCard} />
          </div>
        </div>
      )}
    </div>
  );
};

export const Profile: React.FC<ProfileProps> = ({ user }) => {
  const [uploading, setUploading] = useState(false);
  const [profileTab, setProfileTab] = useState<'card' | 'details'>('card');
  const t = translations[user.language || 'az'];

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const imageUrl = await uploadImageToImgBB(file);
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL: imageUrl
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <header className="space-y-1 pb-5 border-b border-border">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
          <Bookmark className="w-3.5 h-3.5" />
          <span>Rəsmi Mədrəsə Şəxsi Kabineti</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-text">
          {t.profile} & Vəsiqə
        </h1>
        <p className="text-xs text-muted mt-0.5">
          İsnad Mədrəsəsi • Onlayn Mədrəsə
        </p>
      </header>

      {/* Tabs */}
      {/* Clean Segmented Tab Switcher */}
      <div className="flex bg-neutral-100 dark:bg-neutral-900/90 p-1 rounded-xl border border-neutral-200/60 dark:border-neutral-800/80 max-w-sm mx-auto">
        <button
          onClick={() => setProfileTab('card')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            profileTab === 'card'
              ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 '
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <span>Rəsmi Vəsiqə</span>
        </button>
        <button
          onClick={() => setProfileTab('details')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            profileTab === 'details'
              ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 '
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <span>Məlumatlar</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={profileTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* TAB 1: 3D OFFICIAL STUDENT ID CARD */}
          {profileTab === 'card' && (
            <div className="bg-white dark:bg-neutral-900 p-6 sm:p-8 rounded-2xl border border-neutral-200/80 dark:border-neutral-800  space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Rəsmi Plastik Tələbə Vəsiqəsi (ID-Card)
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  QR-kodlu tələbə kartınız
                </p>
              </div>

              <StudentIDCard user={user} />
            </div>
          )}

          {/* TAB 2: PROFILE DETAILS & PIN CODE */}
          {profileTab === 'details' && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden ">
          <div className="h-32 bg-background relative border-b border-border">
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                  <div className="w-24 h-24 rounded-2xl bg-surface p-1 shadow-sm border border-border relative group">
                      <div className="w-full h-full rounded-2xl bg-background flex items-center justify-center text-3xl font-semibold text-text border border-border overflow-hidden">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            user.name.charAt(0)
                          )}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-xl">
                          {uploading ? (
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          ) : (
                            <Camera className="w-6 h-6 text-white" />
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                      </label>
                  </div>
              </div>
          </div>

          <div className="pt-20 pb-10 px-8">
              <div className="text-center mb-10">
                  <h2 className="text-2xl font-semibold text-text tracking-tight">{user.name}</h2>
                  <p className="text-[11px] font-semibold text-muted mt-1">@{user.username || 'username_yoxdur'}</p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                      <span className="px-4 py-1.5 bg-brand text-white rounded-xl text-[11px] font-semibold shadow-sm">
                          {user.role === 'student' ? t.student : t.teacher}
                      </span>
                  </div>
              </div>

              <div className="grid gap-3">
                  <div className="flex items-center p-5 bg-background/30 rounded-2xl border border-transparent hover:border-border transition-all">
                      <div className="w-10 h-10 bg-surface rounded-xl border border-border flex items-center justify-center mr-4 shadow-sm">
                          <Hash className="w-4 h-4 text-text" />
                      </div>
                      <div>
                          <p className="text-[11px] text-muted font-semibold ">Unikal ID</p>
                          <p className="text-base font-semibold tabular-nums text-text ">{user.id}</p>
                      </div>
                  </div>

                  <div className="flex items-center p-5 bg-background/30 rounded-2xl border border-transparent hover:border-border transition-all">
                      <div className="w-10 h-10 bg-surface rounded-xl border border-border flex items-center justify-center mr-4 shadow-sm">
                          <Mail className="w-4 h-4 text-text" />
                      </div>
                      <div>
                          <p className="text-[11px] text-muted font-semibold ">E-poçt ünvanı</p>
                          <p className="text-sm font-semibold text-text">{user.email}</p>
                      </div>
                  </div>

                  <div className="flex items-center p-5 bg-background/30 rounded-2xl border border-transparent hover:border-border transition-all">
                      <div className="w-10 h-10 bg-surface rounded-xl border border-border flex items-center justify-center mr-4 shadow-sm">
                          <GraduationCap className="w-4 h-4 text-text" />
                      </div>
                      <div>
                          <p className="text-[11px] text-muted font-semibold ">Təhsil Ocağı</p>
                          <p className="text-sm font-semibold text-text tracking-tight">İsnad Mədrəsəsi</p>
                      </div>
                  </div>
              </div>
          </div>
        </div>
      )}
        </motion.div>
      </AnimatePresence>

      {user.role === 'teacher' && <UserList />}
    </div>
  );
};

