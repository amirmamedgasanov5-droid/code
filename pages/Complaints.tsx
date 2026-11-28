import React, { useState, useEffect } from 'react';
import { User, Complaint, ComplaintType, ComplaintStatus } from '../types';
import { db } from '../firebase';
import { 
  collection, onSnapshot, query, orderBy, addDoc, doc, 
  deleteDoc, updateDoc, where, getDocs 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { 
  ShieldAlert, Plus, X, Loader2, Trash2, Users, AlertTriangle, 
  CheckCircle2, Clock, Lock, Unlock, Search, Filter, AlertOctagon, 
  FileText, ShieldCheck, Mail, Calendar, UserX, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isAdminUser } from '../src/utils/roles';
import { Toast } from '../components/Toast';

interface ComplaintsProps {
  user: User;
}

interface StudentOption {
  uid: string;
  id: string;
  name: string;
  username?: string;
  className?: string;
  email?: string;
  isBlocked?: boolean;
  blockedUntil?: string | null;
}

export const Complaints: React.FC<ComplaintsProps> = ({ user }) => {
  const isAdmin = isAdminUser(user);
  const isTeacher = user.role === 'teacher' || isAdmin;
  const isStudent = user.role === 'student' && !isAdmin;

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'ban' | 'warning' | 'resolved'>('all');
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success'
  });

  // New complaint form state
  const [selectedStudentUid, setSelectedStudentUid] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ComplaintType>('warning');
  const [applyBlock, setApplyBlock] = useState(false);
  const [blockDurationType, setBlockDurationType] = useState<'1' | '3' | '7' | '14' | '30' | 'custom' | 'permanent'>('3');
  const [customDays, setCustomDays] = useState(5);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  // Fetch students for admin
  useEffect(() => {
    if (isAdmin || isTeacher) {
      const fetchStudents = async () => {
        try {
          const q = query(collection(db, 'users'), where('role', '==', 'student'));
          const snap = await getDocs(q);
          const list: StudentOption[] = snap.docs.map(d => {
            const data = d.data();
            return {
              uid: d.id,
              id: data.id || d.id,
              name: data.name || 'Tələbə',
              username: data.username,
              className: data.className || data.class,
              email: data.email,
              isBlocked: data.isBlocked,
              blockedUntil: data.blockedUntil
            };
          });
          setStudents(list);
        } catch (err) {
          console.error("Error fetching students:", err);
        }
      };
      fetchStudents();
    }
  }, [isAdmin, isTeacher]);

  // Real-time complaints subscription
  useEffect(() => {
    setLoading(true);
    let q;
    if (isStudent) {
      q = query(
        collection(db, 'complaints'),
        where('studentUid', '==', user.uid)
      );
    } else {
      q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data()
        })) as Complaint[];
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setComplaints(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'complaints');
        showToast("Şikayətləri yükləyərkən xəta baş verdi", "error");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user.uid, isStudent]);

  const presetTitles = [
    "Dərs intizamının kobud pozulması",
    "Müəllim və ya tələbələrə qarşı hörmətsiz rəftar",
    "Ev tapşırıqlarının və dərslərin ardıcıl buraxılması",
    "Mədrəsə daxili qaydalara zidd davranış",
    "Sistemdən qərəzli və ya icazəsiz istifadə cəhdi",
    "Dərs vaxtı kənar fəaliyyətlərlə məşğul olma"
  ];

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast("Yalnız Baş Admin şikayət və sanksiya tətbiq edə bilər", "error");
      return;
    }

    if (!selectedStudentUid || !title.trim() || !description.trim()) {
      showToast("Zəhmət olmasa tələbəni seçin və bütün vacib xanaları doldurun", "error");
      return;
    }

    const student = students.find((s) => s.uid === selectedStudentUid);
    if (!student) {
      showToast("Seçilmiş tələbə tapılmadı", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const isBlocking = applyBlock || type === 'ban';
      let calculatedBlockedUntil: string | null = null;
      let calculatedDays: number | undefined = undefined;

      if (isBlocking) {
        if (blockDurationType === 'permanent') {
          calculatedBlockedUntil = null;
        } else {
          const daysToAdd = blockDurationType === 'custom' ? Number(customDays) : Number(blockDurationType);
          calculatedDays = daysToAdd;
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + daysToAdd);
          calculatedBlockedUntil = expiryDate.toISOString();
        }
      }

      const complaintData = {
        studentId: student.id,
        studentUid: student.uid,
        studentName: student.name,
        studentUsername: student.username || student.id,
        studentClass: student.className || '',
        title: title.trim(),
        description: description.trim(),
        type: isBlocking ? 'ban' : type,
        isBlocked: isBlocking,
        blockDays: calculatedDays,
        blockedUntil: calculatedBlockedUntil,
        blockReason: description.trim(),
        createdBy: "Baş Admin",
        creatorEmail: "amirmamedgasanov5@gmail.com",
        status: 'active' as ComplaintStatus,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'complaints'), complaintData);

      if (isBlocking) {
        await updateDoc(doc(db, 'users', student.uid), {
          isBlocked: true,
          blockedUntil: calculatedBlockedUntil,
          blockReason: description.trim(),
          blockedAt: new Date().toISOString(),
          blockedBy: 'amirmamedgasanov5@gmail.com'
        });
      }

      try {
        await addDoc(collection(db, 'notifications'), {
          userId: student.id || student.uid,
          title: isBlocking ? "Hesabınız bloklandı" : `İntizam Xəbərdarlığı: ${title.trim()}`,
          message: description.trim(),
          type: 'warning',
          read: false,
          createdAt: new Date().toISOString()
        });
      } catch (notifErr) {
        console.warn("Notification send warning:", notifErr);
      }

      showToast(isBlocking ? "Tələbəyə şikayət yazıldı və platforma girişi bloklandı" : "Şikayət qeydə alındı", "success");
      
      setShowModal(false);
      setSelectedStudentUid('');
      setTitle('');
      setDescription('');
      setType('warning');
      setApplyBlock(false);
      setBlockDurationType('3');
      setCustomDays(5);
    } catch (err: any) {
      console.error("Error creating complaint:", err);
      showToast(`Xəta: ${err.message || 'Məlumat yadda saxlanılmadı'}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblockStudent = async (complaint: Complaint) => {
    if (!isAdmin) return;
    if (!window.confirm(`${complaint.studentName} üçün tətbiq olunmuş bloku ləğv etmək istəyirsiniz?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, 'users', complaint.studentUid), {
        isBlocked: false,
        blockedUntil: null,
        blockReason: ''
      });

      await updateDoc(doc(db, 'complaints', complaint.id), {
        isBlocked: false,
        status: 'resolved',
        resolvedAt: new Date().toISOString()
      });

      try {
        await addDoc(collection(db, 'notifications'), {
          userId: complaint.studentId || complaint.studentUid,
          title: "Giriş Bərpa Olundu",
          message: "Platformaya girişiniz administrasiya tərəfindən bərpa edilmişdir.",
          type: 'success',
          read: false,
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn("Unblock notif err:", e);
      }

      showToast(`${complaint.studentName} üçün blok ləğv edildi`, "success");
    } catch (err: any) {
      console.error("Error unblocking student:", err);
      showToast(`Xəta: ${err.message || 'Ləğv etmək mümkün olmadı'}`, "error");
    }
  };

  const handleResolveComplaint = async (complaintId: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'complaints', complaintId), {
        status: 'resolved',
        resolvedAt: new Date().toISOString()
      });
      showToast("Şikayət həll olunmuş kimi qeyd edildi", "success");
    } catch (err: any) {
      console.error("Error resolving complaint:", err);
      showToast("Xəta baş verdi", "error");
    }
  };

  const handleDeleteComplaint = async (complaintId: string) => {
    if (!isAdmin) return;
    if (!window.confirm("Bu şikayəti tamamilə silmək istədiyinizə əminsiniz?")) return;

    try {
      await deleteDoc(doc(db, 'complaints', complaintId));
      showToast("Şikayət silindi", "success");
    } catch (err: any) {
      console.error("Error deleting complaint:", err);
      showToast("Silinmə zamanı xəta baş verdi", "error");
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    const matchesSearch = 
      c.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.studentClass?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedFilter === 'active') return c.status === 'active';
    if (selectedFilter === 'ban') return c.type === 'ban' || c.isBlocked;
    if (selectedFilter === 'warning') return c.type === 'warning' || c.type === 'reprimand' || c.type === 'final_warning';
    if (selectedFilter === 'resolved') return c.status === 'resolved';
    return true;
  });

  const activeBansCount = complaints.filter((c) => (c.type === 'ban' || c.isBlocked) && c.status === 'active').length;
  const activeWarningsCount = complaints.filter((c) => c.status === 'active' && c.type !== 'ban').length;

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString('az-AZ', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const getTypeBadge = (cType: ComplaintType, isBlocked?: boolean) => {
    if (cType === 'ban' || isBlocked) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] tabular-nums font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/40">
          <Lock className="w-2.5 h-2.5" />
          Bloklanıb
        </span>
      );
    }
    if (cType === 'final_warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] tabular-nums font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200/80 dark:border-red-900/40">
          <AlertOctagon className="w-2.5 h-2.5" />
          Son Xəbərdarlıq
        </span>
      );
    }
    if (cType === 'reprimand') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] tabular-nums font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/40">
          <AlertTriangle className="w-2.5 h-2.5" />
          Töhmət
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] tabular-nums font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700/80">
        <Info className="w-2.5 h-2.5" />
        Xəbərdarlıq
      </span>
    );
  };

  const filterTabs = [
    { id: 'all', label: 'Bütün qeydlər', count: complaints.length },
    { id: 'active', label: 'Aktiv', count: complaints.filter(c => c.status === 'active').length },
    { id: 'ban', label: 'Bloklar', count: complaints.filter(c => c.type === 'ban' || c.isBlocked).length },
    { id: 'warning', label: 'Xəbərdarlıqlar', count: complaints.filter(c => c.type !== 'ban' && !c.isBlocked).length },
    { id: 'resolved', label: 'Həll olunub', count: complaints.filter(c => c.status === 'resolved').length },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-neutral-800 pb-5">
        <div>
          <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400 block mb-0.5">
            {isAdmin ? "Baş Admin Moderasiya Paneli" : isTeacher ? "Müəllim Məlumat Mərkəzi" : "Şəxsi İntizam Paneli"}
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            Şikayətlər və İntizam Sistemi
          </h1>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary text-xs font-medium px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Şikayət / Sanksiya</span>
          </button>
        )}
      </header>

      {/* KPI Stats Strip */}
      {(isAdmin || isTeacher) && (
        <div className="grid grid-cols-2 md:grid-cols-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 divide-y md:divide-y-0 md:divide-x divide-neutral-200/80 dark:divide-neutral-800  overflow-hidden">
          <div className="p-4">
            <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400 block mb-1">Cəmi Qeydlər</span>
            <div className="text-xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{complaints.length}</div>
          </div>
          <div className="p-4">
            <span className="text-[11px] tabular-nums text-rose-600 dark:text-rose-400 block mb-1">Aktiv Bloklar</span>
            <div className="text-xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">{activeBansCount}</div>
          </div>
          <div className="p-4">
            <span className="text-[11px] tabular-nums text-amber-600 dark:text-amber-400 block mb-1">Aktiv Xəbərdarlıqlar</span>
            <div className="text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{activeWarningsCount}</div>
          </div>
          <div className="p-4">
            <span className="text-[11px] tabular-nums text-indigo-600 dark:text-indigo-400 block mb-1">Həll Olunmuş</span>
            <div className="text-xl font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
              {complaints.filter(c => c.status === 'resolved').length}
            </div>
          </div>
        </div>
      )}

      {/* Disciplinary Notice for Students */}
      {isStudent && (
        <div className={`p-4 rounded-xl border ${
          complaints.length > 0 
            ? 'bg-amber-50/40 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 text-amber-900 dark:text-amber-200' 
            : 'bg-indigo-50/40 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/40 text-indigo-900 dark:text-indigo-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {complaints.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            )}
            <h2 className="text-xs font-semibold">
              {complaints.length > 0 
                ? "Qeydə alınmış intizam xəbərdarlığınız var" 
                : "İntizam Vəziyyətiniz: Əla (Heç bir qayda pozuntusu yoxdur)"}
            </h2>
          </div>
          <p className="text-[11px] opacity-80 leading-relaxed">
            {complaints.length > 0 
              ? "Mədrəsə qaydalarına riayət etməyiniz xahiş olunur. Təkrar qayda pozuntuları sistemdən kənarlaşdırılma ilə nəticələnə bilər."
              : "Mədrəsə etik və təhsil qaydalarına nümunəvi riayət etdiyiniz üçün təşəkkür edirik."}
          </p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tələbə adı və ya səbəb axtar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-7 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter Pills with animated pill indicator */}
        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/60 p-1 rounded-xl border border-neutral-200/60 dark:border-neutral-800 overflow-x-auto">
          {filterTabs.map((tab) => {
            const isSelected = selectedFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedFilter(tab.id as any)}
                className={`relative px-2.5 py-1 rounded-xl text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'text-neutral-900 dark:text-neutral-100 font-semibold'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
                }`}
              >
                {isSelected && (
                  <motion.span
                    layoutId="complaints-filter-pill"
                    className="absolute inset-0 bg-white dark:bg-neutral-900 rounded-xl  border border-neutral-200/80 dark:border-neutral-800"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <span>{tab.label}</span>
                  <span className="text-[11px] tabular-nums opacity-60">({tab.count})</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Complaints List - Data Grid with hairline horizontal rows */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
          <p className="text-xs tabular-nums text-neutral-400 ">Məlumatlar yüklənir...</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-xl space-y-2">
          <ShieldCheck className="w-8 h-8 text-neutral-400 mx-auto" />
          <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">Qeydə alınmış intizam pozuntusu tapılmadı</h3>
          <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
            {searchQuery 
              ? "Axtarış sorğunuza uyğun nəticə yoxdur." 
              : "Hal-hazırda sistemdə qeydə alınmış aktiv intizam pozuntusu mövcud deyil."}
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedFilter}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-200/60 dark:divide-neutral-800/60 "
          >
            {filteredComplaints.map((c) => {
              const isBanActive = (c.type === 'ban' || c.isBlocked) && c.status === 'active';

              return (
                <div
                  key={c.id}
                  className={`p-4 transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-850/50 ${
                    isBanActive ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeBadge(c.type, c.isBlocked)}
                        {c.status === 'resolved' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] tabular-nums bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/40">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Həll olunub
                          </span>
                        )}
                        <span className="text-[11px] tabular-nums text-neutral-400">
                          {formatDate(c.createdAt)}
                        </span>
                      </div>

                      <h3 className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        {c.title}
                      </h3>

                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-normal">
                        {c.description}
                      </p>

                      {/* Block status badge */}
                      {(c.isBlocked || c.type === 'ban') && (
                        <div className="inline-flex items-center gap-2 text-[11px] tabular-nums text-rose-600 dark:text-rose-400 pt-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {c.blockedUntil 
                              ? `Blok: ${formatDate(c.blockedUntil)} tarixinədək` 
                              : "Blok: Müddətsiz"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Student Info & Admin Actions */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      <div className="flex items-center gap-2 text-right">
                        <div className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-semibold flex items-center justify-center border border-neutral-200/80 dark:border-neutral-700">
                          {c.studentName?.charAt(0) || 'T'}
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{c.studentName}</div>
                          <div className="text-[11px] tabular-nums text-neutral-400">@{c.studentUsername || c.studentId}</div>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1.5 pt-1">
                          {c.isBlocked && (
                            <button
                              onClick={() => handleUnblockStudent(c)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-900/60 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Bloku aç</span>
                            </button>
                          )}
                          {c.status !== 'resolved' && (
                            <button
                              onClick={() => handleResolveComplaint(c.id)}
                              className="px-2 py-1 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              Həll olundu
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteComplaint(c.id)}
                            className="p-1 text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Creation Modal (Admin Only) */}
      <AnimatePresence>
        {showModal && isAdmin && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-neutral-950/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 w-full max-w-xl rounded-2xl shadow-md overflow-hidden my-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-neutral-200/80 dark:border-neutral-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-700">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Yeni Şikayət və İntizam Sanksiyası
                    </h2>
                    <p className="text-[11px] tabular-nums text-neutral-400 ">
                      Baş Admin İcazəsi
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateComplaint} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                {/* 1. Select Student */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Tələbə <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedStudentUid}
                    onChange={(e) => setSelectedStudentUid(e.target.value)}
                    required
                    className="w-full p-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:border-indigo-500 outline-none"
                  >
                    <option value="">-- Tələbəni seçin --</option>
                    {students.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.name} {s.className ? `(${s.className})` : ''} — @{s.username || s.id} {s.isBlocked ? '[Blokdadır]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Preset Quick Titles */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-neutral-500">
                    Şablon Başlıqlar:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {presetTitles.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTitle(preset)}
                        className={`px-2 py-1 rounded-xl text-[11px] border transition-colors cursor-pointer ${
                          title === preset
                            ? 'bg-indigo-600 text-white border-neutral-900 dark:border-neutral-100'
                            : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/80 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Title Input */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Başlıq <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Məsələn: Dərsdə intizamsızlıq"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* 4. Description */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Ətraflı Səbəb <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Hadisənin təfərrüatları və qeydlər..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-normal text-neutral-900 dark:text-neutral-100 focus:border-indigo-500 outline-none resize-none"
                  />
                </div>

                {/* 5. Penalty Level */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Sanksiya Növü
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setType('warning'); setApplyBlock(false); }}
                      className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                        type === 'warning' && !applyBlock
                          ? 'bg-indigo-600 text-white border-neutral-900 dark:border-neutral-100'
                          : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/80 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <Info className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                      <span className="text-[11px] block font-medium">Xəbərdarlıq</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setType('reprimand'); setApplyBlock(false); }}
                      className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                        type === 'reprimand' && !applyBlock
                          ? 'bg-indigo-600 text-white border-neutral-900 dark:border-neutral-100'
                          : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/80 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                      <span className="text-[11px] block font-medium">Töhmət</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setType('final_warning'); setApplyBlock(false); }}
                      className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                        type === 'final_warning' && !applyBlock
                          ? 'bg-indigo-600 text-white border-neutral-900 dark:border-neutral-100'
                          : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/80 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <AlertOctagon className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                      <span className="text-[11px] block font-medium">Son Xəbərdarlıq</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setType('ban'); setApplyBlock(true); }}
                      className={`p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                        type === 'ban' || applyBlock
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/80 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                      <span className="text-[11px] block font-medium">Girişi Blokla</span>
                    </button>
                  </div>
                </div>

                {/* 6. Block Duration Options */}
                {(applyBlock || type === 'ban') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 space-y-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-medium text-xs">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Blok Müddəti</span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {[
                        { id: '1', label: '1 Gün' },
                        { id: '3', label: '3 Gün' },
                        { id: '7', label: '7 Gün' },
                        { id: '14', label: '14 Gün' },
                        { id: '30', label: '30 Gün' },
                        { id: 'permanent', label: 'Daimi' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setBlockDurationType(item.id as any)}
                          className={`p-1.5 rounded-xl text-xs tabular-nums border transition-colors cursor-pointer ${
                            blockDurationType === item.id
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white dark:bg-neutral-800 border-neutral-200/80 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Submit button */}
                <div className="pt-3 border-t border-neutral-200/80 dark:border-neutral-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    Ləğv Et
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary text-xs font-medium px-4 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    <span>Təsdiqlə və Göndər</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
