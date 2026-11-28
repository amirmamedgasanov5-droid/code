import React, { useState, useEffect } from 'react';
import { User, ParentNote, Lesson, Complaint, Congratulation } from '../types';
import { db, auth } from '../firebase';
import { 
  collection, query, where, getDocs, getDoc, onSnapshot, 
  addDoc, setDoc, serverTimestamp, doc, updateDoc, orderBy 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { 
  ShieldCheck, User as UserIcon, BookOpen, ClipboardList, 
  Calendar, Award, AlertTriangle, MessageSquare, Lock, 
  Key, CheckCircle2, XCircle, ChevronRight, Send, 
  LogOut, Phone, Mail, Sparkles, Star, Trophy, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateStudentXP, getRankByXP, getRankProgress } from '../src/utils/rankService';
import { Toast, ToastType } from '../components/Toast';
import { isAdminUser } from '../src/utils/roles';
import { DiplomaCard, DiplomaData } from '../components/DiplomaCard';
import { StudentIDCard } from '../components/StudentIDCard';

interface ParentPortalProps {
  user: User;
}

interface StudentJournalEntry {
  id: string;
  studentId: string;
  subjectId: string;
  date: string;
  mark: string;
  type: string;
}

const SUBJECT_NAMES: Record<string, string> = {
  'arab-dili': 'Ərəb dili',
  'tecvid': 'Təcvid',
  'eqide': 'Əqidə',
  'fiqh': 'Fiqh',
  'hedis': 'Hədis',
  'tefsir': 'Təfsir',
  'exlaq': 'Əxlaq',
  'sira': 'Sira'
};

export const ParentPortal: React.FC<ParentPortalProps> = ({ user }) => {
  const isTeacherOrAdmin = user.role === 'teacher' || isAdminUser(user);
  const isStudent = user.role === 'student' && !isAdminUser(user);
  const isParent = user.role === 'parent' && !isAdminUser(user);

  // PIN / Child Access State
  const [isAuthenticatedParent, setIsAuthenticatedParent] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [studentsList, setStudentsList] = useState<User[]>([]);

  const [parentName, setParentName] = useState(isParent ? user.name : '');
  const [parentPhone, setParentPhone] = useState('');

  // Child Data
  const [journalEntries, setJournalEntries] = useState<StudentJournalEntry[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [congratulations, setCongratulations] = useState<Congratulation[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [parentNotes, setParentNotes] = useState<ParentNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [children, setChildren] = useState<User[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);

  // Parent Inquiry Form State
  const [noteSubject, setNoteSubject] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [isSendingNote, setIsSendingNote] = useState(false);

  // Admin Reply State
  const [replyingNoteId, setReplyingNoteId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Active Tab inside Parent Portal
  const [activeTab, setActiveTab] = useState<'overview' | 'idcard' | 'journal' | 'attendance' | 'discipline' | 'awards' | 'schedule' | 'inquiries'>('overview');

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });

  const showToast = (message: string, type: ToastType) => {
    setToast({ visible: true, message, type });
  };

  // Staff pick any student; a parent account is bound to exactly one child.
  useEffect(() => {
    const load = async () => {
      try {
        if (isTeacherOrAdmin) {
          const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
          setStudentsList(snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id } as User)));
        } else if (isParent) {
          // The child from registration plus any children linked later with extra codes.
          const ids = new Set<string>();
          if (user.childUid) ids.add(user.childUid);
          const links = await getDocs(query(collection(db, 'parent_links'), where('parentUid', '==', user.uid)));
          links.forEach(l => ids.add(l.data().childUid));
          const loaded: User[] = [];
          for (const id of ids) {
            const c = await getDoc(doc(db, 'users', id));
            if (c.exists()) loaded.push({ ...c.data(), id: c.id, uid: c.id } as User);
          }
          setChildren(loaded);
          if (loaded.length > 0) {
            setSelectedStudent(prev => loaded.find(c => c.uid === prev?.uid) || loaded[0]);
            setIsAuthenticatedParent(true);
          }
        }
      } catch (err) {
        console.error('Error loading portal data:', err);
      } finally {
        setPortalReady(true);
      }
    };
    load();
  }, [user.uid, user.role, user.childUid, isTeacherOrAdmin, isParent, reloadKey]);

  // Connect another child with a school-issued code (works from the parent's own account).
  const handleLinkChild = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = linkCode.trim().toUpperCase();
    if (!code || linking) return;
    setLinking(true);
    try {
      const inviteRef = doc(db, 'parent_invites', code);
      const invite = await getDoc(inviteRef);
      if (!invite.exists() || invite.data().used) {
        showToast('Kod yanlışdır və ya artıq istifadə olunub', 'error');
        return;
      }
      const childUid = invite.data().studentUid as string;
      await setDoc(doc(db, 'parent_links', `${user.uid}_${childUid}`), {
        parentUid: user.uid,
        childUid,
        childName: invite.data().studentName || '',
        code,
        createdAt: new Date().toISOString(),
      });
      await updateDoc(inviteRef, { used: true, parentUid: user.uid, usedAt: new Date().toISOString() });
      setLinkCode('');
      setShowLinkForm(false);
      setReloadKey(k => k + 1);
      showToast('Övlad hesabınıza qoşuldu', 'success');
    } catch (err: any) {
      showToast('Qoşulmadı: ' + (err?.message || 'xəta'), 'error');
    } finally {
      setLinking(false);
    }
  };

  const linkForm = (
    <form onSubmit={handleLinkChild} className="flex flex-col sm:flex-row gap-2">
      <input
        value={linkCode}
        onChange={e => setLinkCode(e.target.value.toUpperCase())}
        placeholder="Dəvət kodu"
        maxLength={12}
        className="flex-1 px-3.5 py-2.5 bg-surface border border-border rounded-xl text-sm tracking-widest outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
        required
      />
      <button type="submit" disabled={linking || !linkCode.trim()} className="btn-primary !px-5 disabled:opacity-50">
        {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Qoş'}
      </button>
    </form>
  );


  // Load Child Specific Data once selectedStudent is set
  useEffect(() => {
    if (!selectedStudent) return;
    setLoading(true);

    const studentUid = selectedStudent.uid || selectedStudent.id;

    // 1. Fetch Journal Entries
    const qJournal = query(collection(db, 'journal_v2'), where('studentId', '==', studentUid));
    const unsubJournal = onSnapshot(qJournal, (snap) => {
      setJournalEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudentJournalEntry)));
    });

    // 2. Fetch Complaints / Discipline
    const qComplaints = query(collection(db, 'complaints'), where('studentUid', '==', studentUid));
    const unsubComplaints = onSnapshot(qComplaints, (snap) => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() } as Complaint)));
    });

    // 3. Fetch Congratulations
    const qCongrats = query(collection(db, 'congratulations'), where('studentId', '==', studentUid));
    const unsubCongrats = onSnapshot(qCongrats, (snap) => {
      setCongratulations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Congratulation)));
    });

    // 3b. Fetch Certificates / Diplomas
    const qCerts = query(collection(db, 'certificates'), where('studentId', '==', studentUid));
    const unsubCerts = onSnapshot(qCerts, (snap) => {
      setCertificates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 4. Fetch Schedule
    const unsubLessons = onSnapshot(collection(db, 'lessons'), (snap) => {
      setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson)));
    });

    // 5. Fetch Parent Notes
    const qNotes = query(collection(db, 'parent_notes'), where('studentUid', '==', studentUid));
    const unsubNotes = onSnapshot(qNotes, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ParentNote));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setParentNotes(list);
      setLoading(false);
    });

    return () => {
      unsubJournal();
      unsubComplaints();
      unsubCongrats();
      unsubCerts();
      unsubLessons();
      unsubNotes();
    };
  }, [selectedStudent]);

  // For Teachers / Admin: also load ALL parent notes
  const [allParentNotes, setAllParentNotes] = useState<ParentNote[]>([]);
  useEffect(() => {
    if (!isTeacherOrAdmin) return;
    const qAllNotes = query(collection(db, 'parent_notes'), orderBy('createdAt', 'desc'));
    const unsubAll = onSnapshot(qAllNotes, (snap) => {
      setAllParentNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as ParentNote)));
    });
    return () => unsubAll();
  }, [isTeacherOrAdmin]);

  // Submit Parent Inquiry / Note to Admin
  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !noteSubject.trim() || !noteMessage.trim()) {
      showToast("Zəhmət olmasa mövzu və mesajınızı qeyd edin", "error");
      return;
    }

    setIsSendingNote(true);
    try {
      await addDoc(collection(db, 'parent_notes'), {
        studentId: selectedStudent.id,
        studentUid: selectedStudent.uid,
        studentName: selectedStudent.name,
        studentClass: selectedStudent.className || selectedStudent.class || '1-A',
        parentName: parentName.trim() || 'Valideyn',
        parentPhone: parentPhone.trim() || '',
        subject: noteSubject.trim(),
        message: noteMessage.trim(),
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setNoteSubject('');
      setNoteMessage('');
      showToast("Müraciətiniz mədrəsə rəhbərliyinə çatdırıldı!", "success");
    } catch (err: any) {
      showToast("Xəta baş verdi: " + err.message, "error");
    } finally {
      setIsSendingNote(false);
    }
  };

  // Admin / Teacher replies to parent note
  const handleReplyNote = async (noteId: string) => {
    if (!replyText.trim()) return;
    try {
      await updateDoc(doc(db, 'parent_notes', noteId), {
        reply: replyText.trim(),
        repliedBy: user.name,
        repliedAt: new Date().toISOString(),
        status: 'resolved'
      });
      setReplyingNoteId(null);
      setReplyText('');
      showToast("Valideynə cavab göndərildi!", "success");
    } catch (err: any) {
      showToast("Xəta: " + err.message, "error");
    }
  };

  // Calculate stats for the selected student
  const studentStats = calculateStudentXP(
    journalEntries,
    [],
    0,
    congratulations.length
  );
  const currentRank = getRankByXP(studentStats.xp);
  const progress = getRankProgress(studentStats.xp);

  // Group marks by subject
  const subjectBreakdown: Record<string, { marks: string[]; avg: number }> = {};
  journalEntries.forEach(entry => {
    if (!subjectBreakdown[entry.subjectId]) {
      subjectBreakdown[entry.subjectId] = { marks: [], avg: 0 };
    }
    subjectBreakdown[entry.subjectId].marks.push(entry.mark);
  });

  Object.keys(subjectBreakdown).forEach(subId => {
    const numericalMarks = subjectBreakdown[subId].marks
      .map(m => Number(m))
      .filter(m => !isNaN(m) && m > 0);
    const sum = numericalMarks.reduce((a, b) => a + b, 0);
    subjectBreakdown[subId].avg = numericalMarks.length > 0 ? Number((sum / numericalMarks.length).toFixed(1)) : 5.0;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      {/* Clean Academic Header Banner */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-6  flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Valideyn Portalı · Rəsmi Nəzarət Sistemi</span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-text">
            Tələbənin Təhsil və Davamiyyət İcmalı
          </h1>

          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Real qiymətlər, davamiyyət statistikası, intizam protokolları, rəsmi vəsiqə və diplomlar.
          </p>
        </div>

        {/* If authenticated, show quick student chip */}
        {isAuthenticatedParent && selectedStudent && (
          <div className="flex items-center gap-2.5 bg-neutral-50 dark:bg-neutral-800/60 px-3.5 py-2 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 shrink-0">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-xs">
              {selectedStudent.name.charAt(0)}
            </div>
            <div>
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 block">
                {selectedStudent.name}
              </span>
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {selectedStudent.className || '1-A'}
              </span>
            </div>
            {isTeacherOrAdmin && (
              <button
                onClick={() => setIsAuthenticatedParent(false)}
                className="ml-1 p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 text-xs transition-colors"
                title="Başqa tələbə seç"
              >
                Dəyiş
              </button>
            )}
          </div>
        )}
      </div>

      {/* Not selected yet */}
      {!isAuthenticatedParent ? (
        <div className="max-w-md mx-auto">
          <div className="card space-y-4 text-center">
            {isTeacherOrAdmin ? (
              <>
                <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold tracking-tight text-text">Tələbə seçin</h2>
                  <p className="text-xs text-muted">Seçdiyiniz tələbənin valideyn kabinetinə baxa bilərsiniz.</p>
                </div>
                <select
                  onChange={(e) => {
                    const st = studentsList.find(x => x.uid === e.target.value);
                    if (st) {
                      setSelectedStudent(st);
                      setIsAuthenticatedParent(true);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-text outline-none focus:border-indigo-500"
                  defaultValue=""
                >
                  <option value="">-- Tələbəni seçin --</option>
                  {studentsList.map(st => (
                    <option key={st.uid} value={st.uid}>
                      {st.name} ({st.className || '1-A'})
                    </option>
                  ))}
                </select>
              </>
            ) : isParent ? (
              <>
                <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600">
                  {portalReady ? <Lock className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                </div>
                {portalReady ? (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-base font-semibold tracking-tight text-text">Övladınızı qoşun</h2>
                      <p className="text-xs text-muted">Məktəb idarəsinin verdiyi dəvət kodunu yazın. Övladın öz hesabından daxil olmağa ehtiyac yoxdur.</p>
                    </div>
                    {linkForm}
                  </>
                ) : (
                  <p className="text-sm text-muted">Yüklənir...</p>
                )}
              </>
            ) : (
              <>
                <div className="w-10 h-10 mx-auto rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-muted">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold tracking-tight text-text">Bu bölmə yalnız valideynlər üçündür</h2>
                  <p className="text-xs text-muted">Valideyn hesabı məktəb idarəsinin verdiyi dəvət kodu ilə yaradılır.</p>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Authenticated Parent View */
        <div className="space-y-6">
          {isParent && (
            <div className="card !p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {children.map(c => (
                  <button
                    key={c.uid}
                    onClick={() => setSelectedStudent(c)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      selectedStudent?.uid === c.uid ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-surface border-border text-muted hover:text-text'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                <button onClick={() => setShowLinkForm(v => !v)} className="btn-secondary !px-3.5 !py-1.5">
                  {showLinkForm ? 'Bağla' : '+ Övlad əlavə et (kodla)'}
                </button>
              </div>
              {showLinkForm && linkForm}
            </div>
          )}
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {[
              { id: 'overview', label: 'Ümumi İcmal', icon: UserIcon },
              { id: 'idcard', label: 'Rəsmi Vəsiqə (ID)', icon: ShieldCheck },
              { id: 'journal', label: 'Qiymətlər & Jurnal', icon: BookOpen },
              { id: 'attendance', label: 'Davamiyyət', icon: ClipboardList },
              { id: 'discipline', label: `İntizam (${complaints.length})`, icon: AlertTriangle },
              { id: 'awards', label: `Tərifnamələr (${congratulations.length})`, icon: Award },
              { id: 'schedule', label: 'Dərs Cədvəli', icon: Calendar },
              { id: 'inquiries', label: 'Rəhbərliyə Müraciət', icon: MessageSquare }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 border cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200/80 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* 3D Overview Card */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Child Card */}
                <div className="md:col-span-2 p-6 rounded-2xl bg-surface border-2 border-border shadow-sm flex items-center gap-5">
                  <div className="w-20 h-20 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-3xl font-semibold shadow-md">
                    {selectedStudent?.avatar ? (
                      <img src={selectedStudent.avatar} alt={selectedStudent.name} className="w-full h-full object-cover rounded-2xl" referrerPolicy="no-referrer" />
                    ) : (
                      selectedStudent?.name.charAt(0)
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted">Tələbə Profili</span>
                    <h2 className="text-xl font-semibold text-text">{selectedStudent?.name}</h2>
                    <span className="text-xs font-semibold text-indigo-600 block">{selectedStudent?.className || '1-A sinfi'}</span>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="px-3 py-1 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold text-[11px]">
                        {currentRank.icon} {currentRank.name} Rütbəsi
                      </span>
                      <span className="px-3 py-1 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-semibold text-[11px]">
                        {studentStats.xp} XP
                      </span>
                    </div>
                  </div>
                </div>

                {/* GPA Card */}
                <div className="p-6 rounded-2xl bg-surface border-2 border-border shadow-sm flex flex-col justify-between text-center">
                  <span className="text-xs font-semibold text-muted">Ümumi Orta Bal</span>
                  <div className="text-4xl font-semibold text-indigo-600 my-2">
                    {studentStats.gpa} / 5.0
                  </div>
                  <span className="text-[11px] font-semibold text-muted">Bütün fənlər üzrə yekun</span>
                </div>

                {/* Attendance Rate Card */}
                <div className="p-6 rounded-2xl bg-surface border-2 border-border shadow-sm flex flex-col justify-between text-center">
                  <span className="text-xs font-semibold text-muted">Davamiyyət Faizi</span>
                  <div className="text-4xl font-semibold text-indigo-600 my-2">
                    {studentStats.attendancePlusCount + studentStats.attendanceMinusCount > 0
                      ? `${Math.round((studentStats.attendancePlusCount / (studentStats.attendancePlusCount + studentStats.attendanceMinusCount)) * 100)}%`
                      : '100%'}
                  </div>
                  <span className="text-[11px] font-semibold text-muted">
                    +{studentStats.attendancePlusCount} İştirak • {studentStats.attendanceMinusCount} Qayıb
                  </span>
                </div>
              </div>

              {/* Rank Progress Bar */}
              <div className="p-6 rounded-2xl bg-surface border-2 border-border shadow-sm space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold text-text">
                  <span className="flex items-center gap-2">
                    <span>{currentRank.icon}</span>
                    <span>Cari Səviyyə: {currentRank.name} ({currentRank.title})</span>
                  </span>
                  <span className="text-indigo-600 font-semibold">
                    {progress.nextRank ? `Növbəti Rütbəyə: ${progress.remainingXp} XP` : 'Maksimum Səviyyə! '}
                  </span>
                </div>

                <div className="h-4 bg-background rounded-full overflow-hidden p-0.5 border border-border">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.progressPercent}%` }}
                    className="h-full bg-indigo-600 rounded-full"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-2xl bg-background border border-border text-center">
                    <span className="text-[11px] font-semibold text-muted block">5 Qiymətləri</span>
                    <span className="text-base font-semibold text-amber-500">{studentStats.fivesCount} ədəd</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-border text-center">
                    <span className="text-[11px] font-semibold text-muted block">4 Qiymətləri</span>
                    <span className="text-base font-semibold text-indigo-500">{studentStats.foursCount} ədəd</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-border text-center">
                    <span className="text-[11px] font-semibold text-muted block">İntizam Qeydləri</span>
                    <span className="text-base font-semibold text-rose-500">{complaints.length} ədəd</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-border text-center">
                    <span className="text-[11px] font-semibold text-muted block">Tərifnamələr</span>
                    <span className="text-base font-semibold text-indigo-500">{congratulations.length} ədəd</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1.5: 3D OFFICIAL STUDENT ID CARD */}
          {activeTab === 'idcard' && selectedStudent && (
            <div className="bg-white dark:bg-neutral-900 p-6 sm:p-8 rounded-2xl border border-neutral-200/80 dark:border-neutral-800  space-y-6 text-center">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Rəsmi Tələbə Vəsiqəsi
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Nəsihətlər Mədrəsəsi Akademik Şurası tərəfindən təsdiq olunmuş unikal QR-kodlu və möhürlü tələbə vəsiqəsi
                </p>
              </div>

              <StudentIDCard
                user={{
                  uid: selectedStudent.uid,
                  id: selectedStudent.id,
                  name: selectedStudent.name,
                  email: selectedStudent.email || '',
                  role: 'student',
                  photoURL: selectedStudent.avatar,
                  username: selectedStudent.username,
                  className: selectedStudent.className
                }}
              />
            </div>
          )}

          {/* TAB 2: JOURNAL & GRADES */}
          {activeTab === 'journal' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.keys(SUBJECT_NAMES).map(subId => {
                  const data = subjectBreakdown[subId];
                  const avg = data ? data.avg : 5.0;
                  const marksCount = data ? data.marks.length : 0;

                  return (
                    <div key={subId} className="p-5 rounded-2xl bg-surface border-2 border-border space-y-2 shadow-sm">
                      <div className="flex justify-between items-center">
                        <h4 className="font-semibold text-sm text-text">{SUBJECT_NAMES[subId]}</h4>
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-semibold text-xs">
                          {avg}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-muted block">
                        Cəmi qiymətləndirmə: {marksCount} dəfə
                      </span>
                      {data && data.marks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {data.marks.slice(-6).map((m, idx) => (
                            <span
                              key={idx}
                              className={`w-6 h-6 rounded-xl flex items-center justify-center font-semibold text-xs ${
                                m === '5' ? 'bg-amber-400 text-yellow-950' :
                                m === '4' ? 'bg-indigo-200 text-indigo-900' :
                                m === '3' ? 'bg-slate-200 text-slate-800' :
                                m === '+' ? 'bg-indigo-200 text-indigo-900' :
                                'bg-rose-200 text-rose-900'
                              }`}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Full Recent Grades Log */}
              <div className="bg-surface rounded-2xl border-2 border-border p-6 space-y-4 shadow-sm">
                <h3 className="font-semibold text-base text-text">Son Gündəlik Qiymətlər</h3>
                {journalEntries.length === 0 ? (
                  <p className="text-xs font-semibold text-muted py-6 text-center">Hələlik qiymət daxil edilməyib.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {journalEntries.slice(0, 15).map(entry => (
                      <div key={entry.id} className="py-3 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-xs text-text block">
                            {SUBJECT_NAMES[entry.subjectId] || entry.subjectId}
                          </span>
                          <span className="text-[11px] font-semibold text-muted">
                            Tarix: {entry.date} • Növ: {entry.type === 'daily' ? 'Gündəlik dərs' : entry.type}
                          </span>
                        </div>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-sm ${
                          entry.mark === '5' ? 'bg-amber-400 text-yellow-950 shadow' :
                          entry.mark === '4' ? 'bg-indigo-400 text-white shadow' :
                          entry.mark === '+' ? 'bg-indigo-500 text-white shadow' :
                          'bg-slate-200 text-slate-800'
                        }`}>
                          {entry.mark}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border-2 border-indigo-300 dark:border-indigo-800 text-center">
                  <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 block">Dərsdə İştirak (+)</span>
                  <span className="text-4xl font-semibold text-indigo-600 my-2 block">
                    {studentStats.attendancePlusCount} dərs
                  </span>
                  <span className="text-[11px] font-semibold text-muted">Müvəffəqiyyətlə iştirak edib</span>
                </div>

                <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-300 dark:border-rose-800 text-center">
                  <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 block">Qayıblar (-)</span>
                  <span className="text-4xl font-semibold text-rose-600 my-2 block">
                    {studentStats.attendanceMinusCount} dərs
                  </span>
                  <span className="text-[11px] font-semibold text-muted">Üzrsüz və ya qeydə alınmış qayıb</span>
                </div>

                <div className="p-6 rounded-2xl bg-surface border-2 border-border text-center">
                  <span className="text-xs font-semibold text-muted block">Ümumi Dərs Sayı</span>
                  <span className="text-4xl font-semibold text-text my-2 block">
                    {studentStats.attendancePlusCount + studentStats.attendanceMinusCount}
                  </span>
                  <span className="text-[11px] font-semibold text-muted">Sistemdə qeydə alınan</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DISCIPLINE & COMPLAINTS */}
          {activeTab === 'discipline' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg tracking-tight text-text">
                  İntizam Qeydləri və Xəbərdarlıqlar
                </h3>
              </div>

              {complaints.length === 0 ? (
                <div className="p-10 rounded-2xl bg-surface border-2 border-border text-center space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-indigo-500 mx-auto" />
                  <h4 className="font-semibold text-base text-text">Heç bir intizam xəbərdarlığı yoxdur!</h4>
                  <p className="text-xs text-muted">Övladınız mədrəsə daxili intizam qaydalarına nümunəvi şəkildə əməl edir.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {complaints.map(comp => (
                    <div key={comp.id} className="p-5 rounded-2xl bg-surface border-2 border-rose-200 dark:border-rose-900/50 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-semibold text-xs ">
                          {comp.type === 'warning' ? 'Xəbərdarlıq' :
                           comp.type === 'reprimand' ? 'Töhmət' :
                           comp.type === 'final_warning' ? 'Son Xəbərdarlıq' : 'Blok'}
                        </span>
                        <span className="text-[11px] font-semibold text-muted">{comp.createdAt}</span>
                      </div>
                      <h4 className="font-semibold text-sm text-text">{comp.title}</h4>
                      <p className="text-xs text-muted font-medium">{comp.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: AWARDS & CONGRATULATIONS */}
          {activeTab === 'awards' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg sm:text-xl tracking-tight text-text">
                    Rəsmi diplomlar və Tərifnamələr
                  </h3>
                  <p className="text-xs font-semibold text-muted">
                    Övladınızın qazandığı rəsmi diplomları buradan çap edə və ya HD formatda yükləyə bilərsiniz
                  </p>
                </div>
              </div>

              {/* 3D DIPLOMAS SECTION */}
              {certificates.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                    <span>Rəsmi Mədrəsə Diplomları ({certificates.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {certificates.map((cert) => {
                      const diplomaData: DiplomaData = {
                        id: cert.id,
                        studentName: cert.studentName || selectedStudent?.name || 'Tələbə',
                        type: cert.diplomaType || (cert.type === 'diploma' ? 'diploma' : 'certificate'),
                        title: cert.title || 'Fəxri Mədrəsə Diplomu',
                        reason: cert.reason || 'Mədrəsədə göstərdiyi yüksək nizam-intizam və əla qiymətlərə görə təltif edilir.',
                        teacherName: cert.teacherName || 'Mədrəsə Rəhbərliyi',
                        date: cert.date || (cert.createdAt?.seconds ? new Date(cert.createdAt.seconds * 1000).toLocaleDateString('az-AZ') : '2026-cı il'),
                        serialNumber: cert.serialNumber || `NM-2026-${cert.id?.slice(0, 4).toUpperCase() || '0000'}`,
                      };

                      return (
                        <div key={cert.id} className="bg-surface p-5 sm:p-7 rounded-2xl border border-slate-200 dark:border-slate-800">
                          <DiplomaCard data={diplomaData} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CONGRATULATIONS & PRAISES */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-semibold text-indigo-500 flex items-center gap-1.5">
                  <span>Müəllimlərin Tərifnamələri ({congratulations.length})</span>
                </h4>

                {congratulations.length === 0 && certificates.length === 0 ? (
                  <div className="p-10 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
                    <Award className="w-14 h-14 text-amber-500 mx-auto" />
                    <h4 className="font-semibold text-base text-text ">Hələlik tərifnamə və ya diplom göndərilməyib</h4>
                    <p className="text-xs text-muted max-w-md mx-auto">
                      Övladınız fəallıq göstərdikcə müəllimlər buradan rəsmi diplomlar və tərifnamələr göndərəcək.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {congratulations.map(cong => (
                      <div key={cong.id} className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-300 dark:border-amber-700/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="px-3 py-1 rounded-xl bg-amber-400 text-yellow-950 font-semibold text-xs flex items-center gap-1.5 shadow-sm">
                            <Award className="w-3.5 h-3.5" /> Rəsmi Tərifnamə
                          </span>
                          <span className="text-[11px] font-semibold text-muted">{cong.createdAt}</span>
                        </div>
                        <h4 className="font-semibold text-base text-text">{cong.title}</h4>
                        <p className="text-xs text-text/90 font-medium leading-relaxed ">"{cong.message}"</p>
                        <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-between">
                          <span>Müəllim: {cong.teacherName}</span>
                          {cong.serialNumber && <span className="tabular-nums text-[11px] text-muted">№ {cong.serialNumber}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg tracking-tight text-text">
                Həftəlik Dərs Cədvəli
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {lessons.map(ls => (
                  <div key={ls.id} className="p-5 rounded-2xl bg-surface border-2 border-border space-y-2 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs text-brand ">{ls.subject}</span>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-xl bg-background border border-border">
                        {ls.time}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-text block">Müəllim: {ls.teacherName}</span>
                    <span className="text-[11px] font-semibold text-muted block">Otaq / Sinif: {ls.room || 'Mədrəsə Zal'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: PARENT INQUIRIES & NOTES TO ADMIN */}
          {activeTab === 'inquiries' && (
            <div className="space-y-8">
              {/* Write Note Form */}
              <div className="bg-surface p-6 sm:p-8 rounded-2xl border-2 border-border shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center text-xl shadow">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text tracking-tight">
                      Mədrəsə Rəhbərliyinə Müraciət Göndər
                    </h3>
                    <p className="text-xs text-muted font-medium">
                      Suallarınızı, təkliflərinizi və ya xüsusi qeydlərinizi birbaşa rəhbərliyə ünvanlayın.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSendNote} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted mb-1 ml-1">
                        Valideynin Adı və Soyadı
                      </label>
                      <input
                        type="text"
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="məs: İlqar Əliyev"
                        className="w-full px-4 py-3 bg-background border border-border rounded-xl font-semibold text-xs text-text outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted mb-1 ml-1">
                        Əlaqə Telefonu (Könüllü)
                      </label>
                      <input
                        type="tel"
                        value={parentPhone}
                        onChange={(e) => setParentPhone(e.target.value)}
                        placeholder="+994 50 000 00 00"
                        className="w-full px-4 py-3 bg-background border border-border rounded-xl font-semibold text-xs text-text outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted mb-1 ml-1">
                      Müraciətin Mövzusu
                    </label>
                    <input
                      type="text"
                      value={noteSubject}
                      onChange={(e) => setNoteSubject(e.target.value)}
                      placeholder="məs: Dərslər üzrə əlavə hazırlıq haqqında"
                      className="w-full px-4 py-3 bg-background border border-border rounded-xl font-semibold text-xs text-text outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted mb-1 ml-1">
                      Mesajınız
                    </label>
                    <textarea
                      rows={4}
                      value={noteMessage}
                      onChange={(e) => setNoteMessage(e.target.value)}
                      placeholder="Müraciətinizi ətraflı qeyd edin..."
                      className="w-full px-4 py-3 bg-background border border-border rounded-xl font-semibold text-xs text-text outline-none focus:border-indigo-500 resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingNote}
                    className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-2xl border-indigo-800 shadow-md transition-transform flex items-center justify-center gap-2"
                  >
                    {isSendingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Müraciəti Göndər</span>
                  </button>
                </form>
              </div>

              {/* History of Parent Inquiries */}
              <div className="space-y-4">
                <h3 className="font-semibold text-base text-text">
                  Əvvəlki Müraciətlər və Rəhbərliyin Cavabları
                </h3>

                {parentNotes.length === 0 ? (
                  <p className="text-xs font-semibold text-muted py-4 text-center">Hələlik müraciət göndərilməyib.</p>
                ) : (
                  <div className="space-y-3">
                    {parentNotes.map(pn => (
                      <div key={pn.id} className="p-5 rounded-2xl bg-surface border-2 border-border space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className={`px-3 py-1 rounded-xl text-[11px] font-semibold ${
                            pn.status === 'resolved' ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300' :
                            'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}>
                            {pn.status === 'resolved' ? 'Cavablandırılıb' : 'Baxılır'}
                          </span>
                          <span className="text-[11px] font-semibold text-muted">{pn.createdAt}</span>
                        </div>

                        <div>
                          <h4 className="font-semibold text-sm text-text">{pn.subject}</h4>
                          <p className="text-xs text-muted font-medium mt-1">{pn.message}</p>
                        </div>

                        {pn.reply && (
                          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-1">
                            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 block">
                              Mədrəsə Rəhbərliyinin Cavabı ({pn.repliedBy || 'Müdiriyyət'}):
                            </span>
                            <p className="text-xs font-semibold text-text">{pn.reply}</p>
                            {pn.repliedAt && (
                              <span className="text-[11px] text-muted block text-right">{pn.repliedAt}</span>
                            )}
                          </div>
                        )}

                        {/* If Admin/Teacher is viewing, allow replying */}
                        {isTeacherOrAdmin && !pn.reply && (
                          <div className="pt-2 border-t border-border space-y-2">
                            {replyingNoteId === pn.id ? (
                              <div className="space-y-2">
                                <textarea
                                  rows={2}
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="Valideynə rəsmi cavabı daxil edin..."
                                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-semibold text-text outline-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleReplyNote(pn.id)}
                                    className="px-4 py-2 bg-indigo-600 text-white font-semibold text-xs rounded-xl"
                                  >
                                    Cavabı Göndər
                                  </button>
                                  <button
                                    onClick={() => setReplyingNoteId(null)}
                                    className="px-4 py-2 bg-background border border-border text-muted font-semibold text-xs rounded-xl"
                                  >
                                    Ləğv et
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setReplyingNoteId(pn.id)}
                                className="px-4 py-2 bg-indigo-600/10 text-indigo-600 font-semibold text-xs rounded-xl hover:bg-indigo-600/20"
                              >
                                Valideynə Cavab Yaz
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
