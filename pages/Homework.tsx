
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Homework as HomeworkType, User, Submission, Language, AssignmentType, Question, Exam, ExamSubmission } from '../types';
import { Clock, Plus, X, Loader2, BookOpen, Send, CheckCircle2, AlertCircle, Users, ArrowLeft, MessageSquare, Globe, ClipboardList, PenTool, CheckSquare, Archive, Trash2, Save, Image as ImageIcon, Bookmark } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, where, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import { checkAchievements } from '../src/utils/achievementService';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { translations } from '../i18n';
import { Toast, ToastType } from '../components/Toast';
import { uploadImageToImgBB } from '../src/utils/imgbb';
import { TaskSolver, SolverPayload } from '../components/TaskSolver';
import { ExamService } from '../src/components/services/Exam';

interface HomeworkProps {
    user: User;
}

export const Homework: React.FC<HomeworkProps> = ({ user }) => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<AssignmentType>('homework');
  const [activeStatus, setActiveStatus] = useState<'pending' | 'submitted' | 'graded' | 'archived'>(user.role === 'teacher' ? 'submitted' : 'pending');
  const [filterLang, setFilterLang] = useState<Language | 'all'>('all');
  const [homeworks, setHomeworks] = useState<HomeworkType[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  
  const t = translations[user.language || 'az'];

  const [showForm, setShowForm] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState<HomeworkType | null>(null);

  // Exams that were sent by a teacher are listed in the "İmtahan" tab.
  const [exams, setExams] = useState<Exam[]>([]);
  const [examSubs, setExamSubs] = useState<ExamSubmission[]>([]);
  const [openExamId, setOpenExamId] = useState<string | null>(null);
  const [examNow, setExamNow] = useState(Date.now());
  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'exams'), snap => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)).filter(e => e.published !== false));
    }, () => {});
    const u2 = onSnapshot(query(collection(db, 'exam_submissions'), where('studentId', '==', user.uid)), snap => {
      setExamSubs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamSubmission)));
    }, () => {});
    const t = setInterval(() => setExamNow(Date.now()), 30000);
    return () => { u1(); u2(); clearInterval(t); };
  }, [user.uid]);
  const [viewingSubmissionsFor, setViewingSubmissionsFor] = useState<HomeworkType | null>(null);
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [showCongratulateModal, setShowCongratulateModal] = useState<Submission | null>(null);
  const [congratsData, setCongratsData] = useState({ title: '', message: '' });
  
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [newHw, setNewHw] = useState({ 
    subject: '', 
    title: '', 
    description: '', 
    dueDate: '',
    type: 'homework' as AssignmentType,
    language: (user.language || 'az') as Language,
    questions: [] as Question[],
    imageUrl: ''
  });
  const [hwImage, setHwImage] = useState<File | null>(null);
  const [submissionData, setSubmissionData] = useState<{ text: string, answers: { [key: string]: string | number }, imageUrl: string }>({ text: '', answers: {}, imageUrl: '' });
  const [subImage, setSubImage] = useState<File | null>(null);
  const [gradingData, setGradingData] = useState({ score: 0, grade: '', comment: '' });

  useEffect(() => {
    const hwQuery = query(collection(db, 'homeworks'), orderBy('dueDate', 'desc'));
    const unsubHw = onSnapshot(hwQuery, (snapshot) => {
        const fetchedHws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HomeworkType));
        setHomeworks(fetchedHws);
        
        // Auto-archive past homeworks
        const now = new Date();
        fetchedHws.forEach(async (hw) => {
            if (hw.status === 'active' && new Date(hw.dueDate) < now) {
                try {
                    const hwRef = doc(db, 'homeworks', hw.id);
                    await updateDoc(hwRef, { status: 'archived' });
                } catch (e) {
                    console.error("Auto-archive error", e);
                }
            }
        });

        setLoading(false);
    }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'homeworks');
        setLoading(false);
    });

    const subQuery = user.role === 'teacher' 
        ? collection(db, 'submissions') 
        : query(collection(db, 'submissions'), where('studentId', '==', user.id));
    
    const unsubSub = onSnapshot(subQuery, (snapshot) => {
        setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
        setLoading(false);
    }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'submissions');
        setLoading(false);
    });

    return () => {
        unsubHw();
        unsubSub();
    };
  }, []);

  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHw.title.trim()) return;
    setIsSubmitting(true);
    try {
        let imageUrl = '';
        if (hwImage) {
            imageUrl = await uploadImageToImgBB(hwImage);
        }

        const cleanedQuestions = newHw.questions.map(q => ({
            ...q,
            options: q.options?.map(opt => opt.trim()).filter(opt => opt !== '') || []
        }));

        await addDoc(collection(db, 'homeworks'), {
            ...newHw,
            questions: cleanedQuestions,
            imageUrl,
            dueDate: new Date(newHw.dueDate).toISOString(),
            isCompleted: false,
            lessonId: 'manual',
            status: 'active',
            teacherId: user.id,
            createdAt: new Date().toISOString()
        });
        setShowForm(false);
        setNewHw({ subject: '', title: '', description: '', dueDate: '', type: 'homework', language: (user.language || 'az') as Language, questions: [], imageUrl: '' });
        setHwImage(null);
        setToast({ visible: true, message: "Tapşırıq uğurla yaradıldı.", type: 'success' });
    } catch (error: any) {
        setToast({ visible: true, message: "Xəta: " + error.message, type: 'error' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSubmitHomework = async (payload: SolverPayload) => {
    if (!showSubmitModal || isSubmitting) return;

    setIsSubmitting(true);
    try {
        let imageUrl = '';
        if (payload.image) {
            imageUrl = await uploadImageToImgBB(payload.image);
        }

        const newSub: Submission = {
            id: 'temp-' + Date.now(),
            homeworkId: showSubmitModal.id,
            studentId: user.id,
            studentName: user.name,
            studentUsername: user.username || user.id,
            imageUrl,
            textResponse: payload.text,
            answers: payload.answers,
            submittedAt: new Date().toISOString(),
            status: 'pending'
        };

        await addDoc(collection(db, 'submissions'), newSub);

        // Optimistic update
        setSubmissions(prev => [...prev, newSub]);

        setShowSubmitModal(null);
        setActiveStatus('submitted');
        setToast({ visible: true, message: "Cavabınız uğurla göndərildi.", type: 'success' });
    } catch (error: any) {
        setToast({ visible: true, message: "Xəta: " + error.message, type: 'error' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleGradeSubmission = async () => {
    if (!gradingSubmission || !viewingSubmissionsFor) return;
    setIsSubmitting(true);
    try {
        // Update submission
        const subRef = doc(db, 'submissions', gradingSubmission.id);
        const updatedSub = {
            status: 'graded' as const,
            score: gradingData.score,
            grade: gradingData.grade,
            teacherComment: gradingData.comment
        };
        await updateDoc(subRef, updatedSub);

        // Optimistic update
        setSubmissions(prev => prev.map(s => s.id === gradingSubmission.id ? { ...s, ...updatedSub } : s));

        // Add to grades collection for journal
        await addDoc(collection(db, 'grades'), {
            studentId: gradingSubmission.studentId,
            studentUsername: gradingSubmission.studentUsername || gradingSubmission.studentId,
            subject: viewingSubmissionsFor.subject,
            score: gradingData.score,
            date: new Date().toISOString(),
            comment: gradingData.comment,
            teacherId: user.id
        });

        // Add notification for student
        await addDoc(collection(db, 'notifications'), {
            userId: gradingSubmission.studentId,
            title: "Tapşırıq Qiymətləndirildi",
            message: `${viewingSubmissionsFor.subject}: ${gradingData.grade} (${gradingData.score} bal)`,
            type: 'success',
            read: false,
            createdAt: new Date().toISOString()
        });

        setGradingSubmission(null);
        setGradingData({ score: 0, grade: '', comment: '' });
        
        // Force update local state if needed, though onSnapshot should handle it
        setSubmissions(prev => prev.map(s => s.id === gradingSubmission.id ? { ...s, status: 'graded' } : s));
        
        setActiveStatus('graded');
        if (gradingData.grade === '5') {
            await checkAchievements(gradingSubmission.studentId, (t) => setToast(t as any));
        }
        setToast({ visible: true, message: "Qiymətləndirmə uğurla başa çatdı.", type: 'success' });
    } catch (error: any) {
        setToast({ visible: true, message: "Xəta: " + error.message, type: 'error' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSendCongratulation = async () => {
    if (!showCongratulateModal || !congratsData.title || !congratsData.message) return;
    setIsSubmitting(true);
    try {
        const studentId = (showCongratulateModal as any) === 'all' ? 'all' : (showCongratulateModal.studentUsername || showCongratulateModal.studentId);
        
        await addDoc(collection(db, 'congratulations'), {
            studentId,
            teacherId: user.id,
            teacherName: user.name,
            title: congratsData.title,
            message: congratsData.message,
            seen: false,
            seenBy: studentId === 'all' ? [] : undefined,
            createdAt: new Date().toISOString()
        });
        setShowCongratulateModal(null);
        setCongratsData({ title: '', message: '' });
        setToast({ visible: true, message: "Təbrik məktubu göndərildi!", type: 'success' });
    } catch (error: any) {
        setToast({ visible: true, message: "Xəta: " + error.message, type: 'error' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const filteredHomeworks = useMemo(() => {
    const now = new Date();
    return homeworks.filter(hw => {
        const dueDate = new Date(hw.dueDate);
        const isPast = dueDate < now;
        const isActiveStatus = hw.status === 'active';
        const isArchivedStatus = hw.status === 'archived';
        
        const hwSubs = submissions.filter(s => s.homeworkId === hw.id);
        const userSub = hwSubs.find(s => s.studentId === user.id || s.studentUid === user.uid);
        const hasPendingSubs = hwSubs.some(s => s.status === 'pending');
        const hasGradedSubs = hwSubs.some(s => s.status === 'graded');
        
        const langMatch = filterLang === 'all' || hw.language === filterLang;
        const typeMatch = hw.type === activeCategory;
        
        if (!langMatch || !typeMatch) return false;

        const effectivelyArchived = isArchivedStatus || (isPast && !isActiveStatus);

        if (activeStatus === 'archived') return effectivelyArchived;
        if (effectivelyArchived) return false;

        if (user.role === 'student') {
            if (activeStatus === 'pending') return !userSub;
            if (activeStatus === 'submitted') return userSub?.status === 'pending';
            if (activeStatus === 'graded') return userSub?.status === 'graded';
        } else {
            if (activeStatus === 'submitted') return hasPendingSubs;
            if (activeStatus === 'graded') return !hasPendingSubs && hasGradedSubs;
            if (activeStatus === 'pending') return !hasPendingSubs && !hasGradedSubs;
        }
        return true;
    });
  }, [homeworks, submissions, activeCategory, activeStatus, user.id, user.uid, user.role, filterLang]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(user.language === 'az' ? 'az-AZ' : user.language === 'ru' ? 'ru-RU' : 'en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
  };

  const getTimeRemaining = (iso: string) => {
    const now = new Date();
    const due = new Date(iso);
    const diff = due.getTime() - now.getTime();
    if (diff < 0) return null;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}${t.days_short}`;
    if (hours > 0) return `${hours}${t.hours_short}`;
    return '<1h';
  };

  const langList: {id: Language | 'all', label: string}[] = [
    { id: 'all', label: 'Bütün' },
    { id: 'az', label: 'AZ' },
    { id: 'ru', label: 'RU' },
    { id: 'ar', label: 'AR' },
    { id: 'tr', label: 'TR' },
    { id: 'en', label: 'EN' }
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-6">
          <Loader2 className="w-12 h-12 animate-spin text-brand" />
          <p className="text-[11px] font-semibold text-muted ">Məlumatlar yüklənir...</p>
      </div>
    );
  }

  if (viewingSubmissionsFor) {
    const hwSubs = submissions.filter(s => s.homeworkId === viewingSubmissionsFor.id);
    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            <button onClick={() => setViewingSubmissionsFor(null)} className="flex items-center gap-3 text-muted font-semibold hover:text-text transition-colors text-[11px] ">
                <ArrowLeft className="w-5 h-5" /> Geri qayıt
            </button>
            <header className="p-6 bg-brand-600 rounded-2xl text-white relative overflow-hidden">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-2xl">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">{viewingSubmissionsFor.title}</h1>
                        <p className="text-xs opacity-75 mt-0.5">{viewingSubmissionsFor.subject} • {viewingSubmissionsFor.language?.toUpperCase() || ''} • Tələbə Cavabları</p>
                    </div>
                </div>
            </header>
            <div className="grid gap-6">
                {hwSubs.length > 0 ? hwSubs.map(sub => (
                    <div key={sub.id} className="card !p-8 space-y-6">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-semibold text-text text-lg border border-border/50">
                                    {sub.studentName.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-text text-lg tracking-tight">{sub.studentName}</h3>
                                    <p className="text-[11px] text-muted font-semibold mt-1">@{sub.studentUsername || 'yoxdur'} • {formatDate(sub.submittedAt)}</p>
                                </div>
                            </div>
                            {sub.status === 'graded' ? (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-50 text-text rounded-2xl border border-border/50 shadow-sm">
                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                        <span className="text-[11px] font-semibold ">Qiymətləndirilib: {sub.grade} ({sub.score} bal)</span>
                                    </div>
                                    <button 
                                        onClick={() => setShowCongratulateModal(sub)}
                                        className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors border border-amber-100"
                                        title="Təbrik et"
                                    >
                                        <Bookmark size={20} />
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => setGradingSubmission(sub)}
                                    className="px-8 py-3.5 bg-brand text-white rounded-xl text-[11px] font-semibold transition-all"
                                >
                                    Qiymətləndir
                                </button>
                            )}
                        </div>
                        
                        {/* ANSWERS DISPLAY */}
                        {viewingSubmissionsFor.questions && viewingSubmissionsFor.questions.length > 0 && sub.answers && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {viewingSubmissionsFor.questions.map((q, idx) => {
                                    const studentAns = sub.answers![q.id];
                                    const isCorrect = studentAns === q.correctAnswer;
                                    return (
                                        <div key={q.id} className={`p-4 rounded-2xl border text-[11px] font-semibold flex items-center gap-3 ${isCorrect ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                                            <span className={`w-6 h-6 rounded-xl flex items-center justify-center shrink-0 ${isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{idx + 1}</span>
                                            <span className="truncate">Cavab: {q.options?.[studentAns as number] || 'Yoxdur'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="p-6 bg-neutral-50 rounded-2xl border border-border/50 text-sm leading-relaxed text-text font-medium">
                            {sub.textResponse}
                        </div>

                        {sub.imageUrl && (
                            <div className="rounded-2xl overflow-hidden border border-border/50 max-w-2xl shadow-sm">
                                <img src={sub.imageUrl} alt="Tələbə cavabı" className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                            </div>
                        )}

                        {sub.teacherComment && (
                            <div className="p-6 bg-brand/5 rounded-2xl border border-brand/10 text-xs text-text font-medium flex items-start gap-3">
                                <div className="p-2 bg-brand/10 rounded-xl shrink-0">
                                    <PenTool className="w-4 h-4 text-brand" />
                                </div>
                                <div>
                                    <span className="font-semibold text-[11px] text-brand block mb-1">Müəllim qeydi:</span>
                                    {sub.teacherComment}
                                </div>
                            </div>
                        )}
                    </div>
                )) : (
                    <div className="py-16 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50">
                        <Users className="w-8 h-8 text-neutral-400 mx-auto mb-2 opacity-50" />
                        <p className="text-neutral-500 font-medium text-xs">Hələlik heç bir tələbə cavab göndərməyib.</p>
                    </div>
                )}
            </div>

            {/* GRADING MODAL */}
            {gradingSubmission && (
                <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/60 animate-reveal">
                    <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-2xl shadow-md border border-neutral-200/80 dark:border-neutral-800 overflow-hidden">
                        <div className="p-10 bg-brand text-white flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/10 rounded-2xl">
                                    <PenTool className="w-6 h-6" />
                                </div>
                                <h2 className="text-2xl font-semibold tracking-tight ">Qiymətləndirmə</h2>
                            </div>
                            <button onClick={() => setGradingSubmission(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-7 h-7" />
                            </button>
                        </div>
                        <div className="p-10 space-y-8 max-h-[80vh] overflow-y-auto no-scrollbar">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-semibold text-muted ml-1">Bal (0-100)</label>
                                    <input 
                                        type="number" 
                                        className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text"
                                        value={gradingData.score}
                                        onChange={e => setGradingData({ ...gradingData, score: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-semibold text-muted ml-1">Qiymət</label>
                                    <input 
                                        className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text"
                                        placeholder="Məs: 5"
                                        value={gradingData.grade}
                                        onChange={e => setGradingData({ ...gradingData, grade: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[11px] font-semibold text-muted ml-1">Rəy</label>
                                <textarea 
                                    className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text min-h-[120px]"
                                    placeholder="Tələbəyə qeydləriniz..."
                                    value={gradingData.comment}
                                    onChange={e => setGradingData({ ...gradingData, comment: e.target.value })}
                                />
                            </div>
                            <button 
                                onClick={handleGradeSubmission}
                                disabled={isSubmitting}
                                className="w-full bg-brand text-white py-6 rounded-2xl font-semibold text-[11px] transition-all"
                            >
                                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Təsdiqlə"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONGRATULATE MODAL moved to end of file */}
        </div>
    );
  }

  if (showSubmitModal) {
    const hw = showSubmitModal;
    return (
      <>
        <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />
        <TaskSolver
          title={hw.title}
          subtitle={`${hw.subject}${hw.dueDate ? ' · Son tarix: ' + hw.dueDate : ''}`}
          description={hw.description}
          images={hw.imageUrl ? [hw.imageUrl] : []}
          questions={(hw.questions || []).map(q => ({
            id: q.id,
            text: q.text,
            type: q.type,
            options: q.options,
            correctIndex: q.correctAnswer,
          }))}
          allowExtras
          requireText={!(hw.questions && hw.questions.length > 0)}
          submitting={isSubmitting}
          draftKey={`hw_draft_${hw.id}_${user.id}`}
          onBack={() => setShowSubmitModal(null)}
          onSubmit={handleSubmitHomework}
        />
      </>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({...toast, visible: false})} />
      
      <header className="space-y-10 pb-12">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-5 border-b border-border">
            <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
                    <Bookmark size={13} />
                    <span className="text-[11px] font-semibold ">{t.homework} Mərkəzi</span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-text">{t.homework}</h1>
                <p className="text-xs text-muted max-w-md leading-relaxed">Akademik tapşırıqlar, testlər və sinif işlərini buradan idarə edə bilərsiniz.</p>
                
                {user.role === 'teacher' && (
                    <button
                        onClick={() => setShowCongratulateModal('all' as any)}
                        className="flex items-center gap-3 px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 transition-all font-semibold text-[11px] mt-3 group"
                    >
                        <Bookmark size={16} className=" transition-transform" />
                        <span>Hamıya Təbrik Göndər</span>
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {langList.map(l => (
                        <button 
                            key={l.id}
                            onClick={() => setFilterLang(l.id)}
                            className={`text-[11px] font-semibold px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filterLang === l.id ? 'bg-brand text-white border-brand' : 'text-muted border-border/50 hover:border-brand/30 bg-white'}`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
                    {[
                        { id: 'homework', label: t.homework_type },
                        { id: 'classwork', label: t.classwork_type },
                        { id: 'mock', label: t.mock_type },
                        { id: 'test', label: t.test_type },
                        { id: 'notes', label: t.notes_type }
                    ].map(cat => (
                        <button 
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id as AssignmentType)}
                            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${activeCategory === cat.id ? 'bg-surface text-brand-600 shadow-sm' : 'text-muted hover:text-text'}`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-between gap-6 pt-6 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-2">
                {[
                    { id: 'pending', label: t.not_done },
                    { id: 'submitted', label: t.done },
                    { id: 'graded', label: t.checked },
                    { id: 'archived', label: t.archive }
                ].map(status => (
                    <button 
                        key={status.id}
                        onClick={() => setActiveStatus(status.id as any)}
                        className={`px-4 py-2 text-xs font-medium rounded-xl transition-all border ${activeStatus === status.id ? 'bg-brand text-white border-brand' : 'text-muted border-transparent hover:bg-neutral-50'}`}
                    >
                        {status.label}
                    </button>
                ))}
            </div>
            
            <div className="flex items-center gap-4">
                <div className="bg-neutral-50 text-muted px-4 py-2.5 rounded-2xl text-[11px] font-semibold border border-border/50">
                    {t.total_works}: <span className="text-brand ml-1">{filteredHomeworks.length}</span>
                </div>
            </div>
        </div>
      </header>

      {activeCategory === 'test' && exams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">İmtahanlar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exams.map(e => {
              const mySub = examSubs.find(x => x.examId === e.id);
              const submitted = !!mySub;
              const hasDeadline = typeof e.expiresAtMs === 'number';
              const closed = hasDeadline && examNow > (e.expiresAtMs as number);
              const mins = hasDeadline ? Math.max(0, Math.floor(((e.expiresAtMs as number) - examNow) / 60000)) : 0;
              const left = mins >= 1440 ? `${Math.floor(mins / 1440)} дн. ${Math.floor((mins % 1440) / 60)} ч` : mins >= 60 ? `${Math.floor(mins / 60)} ч ${mins % 60} мин` : `${mins} мин`;
              return (
                <div key={e.id} className="card space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text">{e.title}</h3>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{e.description}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span>{e.questions.length} sual</span>
                      {hasDeadline && !closed && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Qalıb: {left}</span>}
                    </div>
                    {submitted ? (
                      <span className="text-xs font-medium text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Tamamlanıb{mySub?.gradeMark ? ` · Оценка: ${mySub.gradeMark}` : ''}</span>
                    ) : closed ? (
                      <span className="text-xs font-medium text-red-500">Müddət bitib</span>
                    ) : (
                      <button onClick={() => setOpenExamId(e.id)} className="btn-primary">Başla</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {user.role === 'teacher' && !showForm && (
          <button onClick={() => setShowForm(true)} className="w-full py-8 border border-dashed border-border rounded-2xl text-muted hover:text-text hover:border-text/30 transition-all flex flex-col items-center justify-center gap-4 bg-white/50">
              <Plus className="w-6 h-6" />
              <span className="font-semibold text-[11px] ">Yeni tapşırıq yarat</span>
          </button>
      )}

      {showForm && (
            <div className="card !p-6 animate-reveal space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-semibold text-text tracking-tight ">Yeni Tapşırıq Forması</h2>
                    <button onClick={() => setShowForm(false)} className="p-2 hover:bg-neutral-50 rounded-full transition-colors"><X className="w-6 h-6 text-muted" /></button>
                </div>
                <div className="grid md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-muted ml-1 ">Fənn</label>
                        <input required className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text" placeholder="Məs: Ərəb dili" value={newHw.subject} onChange={e => setNewHw({...newHw, subject: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-muted ml-1 ">Növ</label>
                        <select required className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text" value={newHw.type} onChange={e => setNewHw({...newHw, type: e.target.value as AssignmentType})}>
                            <option value="homework">{t.homework_type}</option>
                            <option value="classwork">{t.classwork_type}</option>
                            <option value="mock">{t.mock_type}</option>
                            <option value="test">{t.test_type}</option>
                            <option value="notes">{t.notes_type}</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-muted ml-1 ">Dil</label>
                        <select required className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text" value={newHw.language} onChange={e => setNewHw({...newHw, language: e.target.value as Language})}>
                            <option value="az">Azərbaycan</option>
                            <option value="ru">Русский</option>
                            <option value="ar">العربية</option>
                            <option value="tr">Türkçe</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-muted ml-1 ">Son Tarix</label>
                        <input required type="datetime-local" className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text" value={newHw.dueDate} onChange={e => setNewHw({...newHw, dueDate: e.target.value})} />
                    </div>
                </div>

                {/* QUESTION BUILDER */}
                {(newHw.type === 'test' || newHw.type === 'mock') && (
                    <div className="space-y-10 p-10 bg-neutral-50/50 rounded-2xl border border-border/50 max-h-[700px] overflow-y-auto no-scrollbar">
                        <div className="flex items-center justify-between sticky top-0 bg-neutral-50/80 z-10 pb-6 border-b border-border/50 mb-8">
                            <div className="space-y-1">
                                <h3 className="text-[11px] font-semibold text-brand">Sual-Cavab Qurucusu</h3>
                                <p className="text-[11px] text-muted font-semibold ">Test tapşırıqlarını buradan idarə edin</p>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setNewHw({
                                    ...newHw,
                                    questions: [...newHw.questions, { id: Math.random().toString(36).substr(2, 9), text: '', type: 'choice', options: ['', '', '', ''], correctAnswer: 0 }]
                                })}
                                className="flex items-center gap-3 px-4 py-2.5 bg-brand text-white rounded-2xl text-[11px] font-semibold transition-all group"
                            >
                                <Plus className="w-4 h-4 transition-transform" /> Sual Əlavə Et
                            </button>
                        </div>
                        
                        <div className="space-y-10">
                            {newHw.questions.map((q, qIdx) => (
                                <div key={q.id} className="p-10 bg-white rounded-2xl border border-border/50 space-y-8 shadow-sm transition-shadow">
                                    <div className="flex justify-between items-start gap-8">
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-center gap-3">
                                                <span className="w-8 h-8 rounded-xl bg-brand/5 text-brand flex items-center justify-center text-[11px] font-semibold border border-brand/10">{qIdx + 1}</span>
                                                <label className="text-[11px] font-semibold text-muted ">Sualın Mətni</label>
                                            </div>
                                            <input 
                                                className="w-full bg-neutral-50 border border-border/50 rounded-2xl p-5 text-sm font-medium outline-none focus:border-brand/20 transition-all text-text"
                                                placeholder="Sualı daxil edin..."
                                                value={q.text}
                                                onChange={e => {
                                                    const qs = [...newHw.questions];
                                                    qs[qIdx].text = e.target.value;
                                                    setNewHw({ ...newHw, questions: qs });
                                                }}
                                            />
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const qs = newHw.questions.filter((_, i) => i !== qIdx);
                                                setNewHw({ ...newHw, questions: qs });
                                            }}
                                            className="p-4 text-muted hover:text-red-500 transition-all bg-neutral-50 rounded-2xl border border-border/50 hover:bg-red-50 hover:border-red-100"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {q.options?.map((opt, optIdx) => (
                                            <div key={optIdx} className="flex items-center gap-4 group/opt">
                                                <div className="relative flex items-center justify-center">
                                                    <input 
                                                        type="radio"
                                                        name={`correct-${q.id}`}
                                                        checked={q.correctAnswer === optIdx}
                                                        onChange={() => {
                                                            const qs = [...newHw.questions];
                                                            qs[qIdx].correctAnswer = optIdx;
                                                            setNewHw({ ...newHw, questions: qs });
                                                        }}
                                                        className="peer absolute inset-0 opacity-0 cursor-pointer z-10"
                                                    />
                                                    <div className={`w-6 h-6 rounded-xl border-2 transition-all flex items-center justify-center ${q.correctAnswer === optIdx ? 'bg-brand border-brand' : 'border-border peer-hover:border-brand/30'}`}>
                                                        {q.correctAnswer === optIdx && <CheckCircle2 className="w-4 h-4 text-white" />}
                                                    </div>
                                                </div>
                                                <div className="relative flex-1">
                                                    <input 
                                                        className={`w-full bg-neutral-50 border rounded-2xl p-5 pr-14 text-xs font-medium outline-none transition-all text-text ${q.correctAnswer === optIdx ? 'border-brand/30 bg-brand/[0.02]' : 'border-border/50 focus:border-brand/20'}`}
                                                        placeholder={`Variant ${optIdx + 1}`}
                                                        value={opt}
                                                        onChange={e => {
                                                            const qs = [...newHw.questions];
                                                            qs[qIdx].options![optIdx] = e.target.value;
                                                            setNewHw({ ...newHw, questions: qs });
                                                        }}
                                                    />
                                                    {q.options!.length > 2 && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => {
                                                                const qs = [...newHw.questions];
                                                                qs[qIdx].options = qs[qIdx].options!.filter((_, i) => i !== optIdx);
                                                                if (qs[qIdx].correctAnswer! >= qs[qIdx].options!.length) {
                                                                    qs[qIdx].correctAnswer = 0;
                                                                }
                                                                setNewHw({ ...newHw, questions: qs });
                                                            }}
                                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-muted hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition-all"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {q.options!.length < 6 && (
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const qs = [...newHw.questions];
                                                    qs[qIdx].options = [...qs[qIdx].options!, ''];
                                                    setNewHw({ ...newHw, questions: qs });
                                                }}
                                                className="flex items-center justify-center gap-3 p-5 border border-dashed border-border rounded-2xl text-[11px] font-semibold text-muted hover:text-brand hover:border-brand/30 transition-all bg-neutral-50/50"
                                            >
                                                <Plus className="w-4 h-4" /> Variant Əlavə Et
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-muted ml-1 ">Tapşırığın Mövzusu</label>
                    <input required className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text" placeholder="Mövzu başlığını yazın" value={newHw.title} onChange={e => setNewHw({...newHw, title: e.target.value})} />
                </div>
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-muted ml-1 ">Təsvir</label>
                    <textarea className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand/20 transition-all text-text min-h-[120px]" placeholder="Tapşırıq haqqında ətraflı məlumat..." value={newHw.description} onChange={e => setNewHw({...newHw, description: e.target.value})} />
                </div>
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-muted ml-1 ">Şəkil Əlavə Et (Könüllü)</label>
                    <div className="flex items-center gap-4">
                        <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            id="hw-image-upload"
                            onChange={e => setHwImage(e.target.files?.[0] || null)}
                        />
                        <label 
                            htmlFor="hw-image-upload"
                            className="flex items-center gap-3 px-4 py-2.5 bg-neutral-50 text-muted rounded-2xl text-[11px] font-semibold cursor-pointer hover:bg-slate-100 transition-colors border border-border/50"
                        >
                            <ImageIcon className="w-4 h-4" />
                            {hwImage ? hwImage.name : "Şəkil seçin"}
                        </label>
                        {hwImage && (
                            <button onClick={() => setHwImage(null)} className="text-red-500 hover:text-red-600 p-2 bg-red-50 rounded-xl">
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                <button type="submit" onClick={handleCreateHomework} disabled={isSubmitting} className="w-full bg-brand text-white py-6 rounded-2xl font-semibold text-[11px] transition-all">
                    {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Tapşırığı yadda saxla"}
                </button>
            </div>
      )}

      <div className="grid gap-6">
        {filteredHomeworks.length > 0 ? filteredHomeworks.map((hw) => {
            const userSub = submissions.find(s => s.homeworkId === hw.id && s.studentId === user.id);
            const totalSubs = submissions.filter(s => s.homeworkId === hw.id).length;
            const pendingSubs = submissions.filter(s => s.homeworkId === hw.id && s.status === 'pending').length;
            const timeRemaining = getTimeRemaining(hw.dueDate);
            const isPast = new Date(hw.dueDate) < new Date();
            const isActiveStatus = hw.status === 'active';
            const isArchivedStatus = hw.status === 'archived';

            const typeLabel = hw.type === 'homework' ? t.homework_type : 
                             hw.type === 'classwork' ? t.classwork_type :
                             hw.type === 'mock' ? t.mock_type :
                             hw.type === 'test' ? t.test_type : t.notes_type;

            return (
                <div key={hw.id} className="group bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors  relative">
                    <div className="space-y-4 flex-1 relative z-10">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className={`px-5 py-2 text-[11px] font-semibold rounded-xl shadow-sm ${isPast ? 'bg-slate-100 text-muted' : 'bg-brand text-white'}`}>
                                {typeLabel}
                            </span>
                            <span className="px-5 py-2 bg-neutral-50 text-muted text-[11px] font-semibold rounded-xl border border-border/50">
                                {hw.subject}
                            </span>
                            {timeRemaining && !isPast && (
                                <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 text-amber-600 text-[11px] font-semibold rounded-xl border border-amber-100">
                                    <Clock size={12} />
                                    {timeRemaining}
                                </div>
                            )}
                            {isPast && isActiveStatus && (
                                <span className="px-5 py-2 bg-red-50 text-red-600 text-[11px] font-semibold rounded-xl border border-red-100">
                                    {t.overdue}
                                </span>
                            )}
                        </div>
                        
                        <div className="space-y-1.5">
                            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-tight">{hw.title}</h3>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2 max-w-2xl">{hw.description}</p>
                            
                            {hw.imageUrl && (
                                <div className="mt-3 rounded-2xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800 max-w-sm">
                                    <img src={hw.imageUrl} alt={hw.title} className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                                </div>
                            )}
                        </div>
 
                        <div className="flex items-center gap-10 pt-4">
                            <div className="flex items-center gap-3 text-[11px] font-semibold text-muted ">
                                <div className="p-2 bg-neutral-50 rounded-xl">
                                    <Clock className="w-4 h-4" />
                                </div>
                                {formatDate(hw.dueDate)}
                            </div>
                            {hw.questions && hw.questions.length > 0 && (
                                <div className="flex items-center gap-3 text-[11px] font-semibold text-text ">
                                    <div className="p-2 bg-brand/5 rounded-xl text-brand">
                                        <ClipboardList className="w-4 h-4" />
                                    </div>
                                    {hw.questions.length} {t.questions_count}
                                </div>
                            )}
                        </div>
                    </div>
 
                    <div className="flex items-center gap-6 w-full md:w-auto shrink-0 relative z-10">
                        {user.role === 'teacher' && (
                            <div className="flex flex-col items-end gap-2 mr-4">
                                <div className="text-[11px] font-semibold text-muted ">
                                    {t.done}: <span className="text-brand text-lg ml-1">{totalSubs}</span>
                                </div>
                                {pendingSubs > 0 && (
                                    <div className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-4 py-1.5 rounded-full border border-amber-100">
                                        {pendingSubs} {t.not_done}
                                    </div>
                                )}
                            </div>
                        )}
 
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            {user.role === 'teacher' && (
                                <button 
                                    onClick={async () => {
                                        if (window.confirm('Bu tapşırığı silmək istədiyinizə əminsiniz?')) {
                                            try {
                                                const { deleteDoc, doc } = await import('firebase/firestore');
                                                await deleteDoc(doc(db, 'homeworks', hw.id));
                                                setToast({ visible: true, message: "Tapşırıq silindi.", type: 'success' });
                                            } catch (e: any) {
                                                setToast({ visible: true, message: "Xəta: " + e.message, type: 'error' });
                                            }
                                        }
                                    }}
                                    className="p-5 text-muted hover:text-red-500 transition-all bg-neutral-50 rounded-2xl border border-border/50 hover:bg-red-50 hover:border-red-100"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                            
                            {user.role === 'student' && userSub ? (
                                <div className="flex items-center gap-4 px-10 py-5 bg-brand text-white rounded-2xl w-full md:w-auto justify-center">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span className="text-[11px] font-semibold ">
                                        {userSub.status === 'graded' ? `${t.grade}: ${userSub.grade}` : t.done}
                                    </span>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => user.role === 'teacher' ? setViewingSubmissionsFor(hw) : setShowSubmitModal(hw)} 
                                    className="w-full md:w-auto px-12 py-5 bg-brand text-white rounded-2xl text-[11px] font-semibold transition-all "
                                >
                                    {user.role === 'teacher' ? t.read : t.send}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )
        }) : (
            <div className="p-16 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50">
                <AlertCircle className="w-8 h-8 text-neutral-400 mx-auto mb-2 opacity-50" />
                <p className="text-neutral-500 font-medium text-xs">Hələ heç bir tapşırıq yoxdur.</p>
            </div>
        )}
      </div>

      {/* CONGRATULATE MODAL */}
      {showCongratulateModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-900/40 animate-reveal">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-md border border-border/50 overflow-hidden">
                  <div className="p-10 bg-amber-500 text-white flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-white/10 rounded-2xl">
                              <Bookmark className="w-6 h-6" />
                          </div>
                          <h2 className="text-2xl font-semibold tracking-tight ">Təbrik Məktubu</h2>
                      </div>
                      <button onClick={() => setShowCongratulateModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                          <X className="w-7 h-7" />
                      </button>
                  </div>
                  <div className="p-10 space-y-8">
                      <div className="space-y-3">
                          <label className="text-[11px] font-semibold text-muted ml-1">Başlıq</label>
                          <input 
                              className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-200 transition-all text-text"
                              placeholder="Məs: Əla nəticə!"
                              value={congratsData.title}
                              onChange={e => setCongratsData({ ...congratsData, title: e.target.value })}
                          />
                      </div>
                      <div className="space-y-3">
                          <label className="text-[11px] font-semibold text-muted ml-1">Məktubun Mətni</label>
                          <textarea 
                              className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-200 transition-all text-text min-h-[180px]"
                              placeholder="Tələbəyə ürək sözləriniz..."
                              value={congratsData.message}
                              onChange={e => setCongratsData({ ...congratsData, message: e.target.value })}
                          />
                      </div>
                      <button 
                          onClick={handleSendCongratulation}
                          disabled={isSubmitting || !congratsData.title || !congratsData.message}
                          className="w-full bg-amber-500 text-white py-6 rounded-2xl font-semibold text-[11px] transition-all disabled:opacity-50"
                      >
                          {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Göndər"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {openExamId && <ExamService user={user} initialExamId={openExamId} onClose={() => setOpenExamId(null)} />}
    </div>
  );
};
