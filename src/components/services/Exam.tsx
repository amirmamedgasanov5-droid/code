
import React, { useState, useEffect, useRef } from 'react';
import { TaskSolver } from '../../../components/TaskSolver';
import { isStaffUser } from '../../utils/roles';
import { ISLAM_EXAM_MEDIUM } from '../../data/islamExam';
import { SUBJECTS, suggestMark } from '../../data/subjects';
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Send, ChevronRight, ClipboardList, User as UserIcon, Clock, Award, Check, Play } from 'lucide-react';
import { db } from '../../../firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc, getDocs, orderBy, updateDoc, writeBatch, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../utils/firestoreError';
import { motion, AnimatePresence } from 'motion/react';
import { User, Exam, ExamSubmission } from '../../../types';

interface ExamServiceProps {
  user: User;
  onClose: () => void;
  /** Opens this exam straight away (used by the "İmtahan" tab of the homework page). */
  initialExamId?: string;
}

export const ExamService: React.FC<ExamServiceProps> = ({ user, onClose, initialExamId }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'take' | 'results'>('list');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  // Teacher Create State
  const [newExam, setNewExam] = useState({
    title: '',
    description: '',
    questions: [] as { id: string; text: string; options: string[]; correctIndex: number }[]
  });
  const [newQuestion, setNewQuestion] = useState({
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0
  });

  // Student Take State

  const isTeacher = isStaffUser(user);
  const startedRef = useRef(false);

  // When opened for one exam, leaving the exam also closes the whole panel.
  const leaveExam = () => {
    setView('list');
    setActiveExam(null);
    if (initialExamId) onClose();
  };

  useEffect(() => {
    if (!initialExamId || startedRef.current) return;
    const e = exams.find(x => x.id === initialExamId);
    if (!e) return;
    startedRef.current = true;
    setActiveExam(e);
    setView('take');
  }, [initialExamId, exams]);

  // ── Language (students can switch the whole exam to Russian) ──
  const [lang, setLangState] = useState<'az' | 'ru'>(() => {
    try { return localStorage.getItem('exam_lang') === 'az' ? 'az' : 'ru'; } catch { return 'ru'; }
  });
  const setLang = (l: 'az' | 'ru') => {
    setLangState(l);
    try { localStorage.setItem('exam_lang', l); } catch {}
  };
  const T = {
    az: { title: 'İmtahanlar', available: 'Mövcud imtahanlar', start: 'Başla', done: 'Tamamlanıb', questions: 'Sual', none: 'Hələ heç bir imtahan yoxdur.', closed: 'Müddət bitib', left: 'Qalıb', d: 'gün', h: 'saat', m: 'dəq', submit: 'İmtahanı təhvil ver' },
    ru: { title: 'Экзамены', available: 'Доступные экзамены', start: 'Начать', done: 'Сдан', questions: 'вопросов', none: 'Экзаменов пока нет.', closed: 'Срок истёк', left: 'Осталось', d: 'д', h: 'ч', m: 'мин', submit: 'Сдать экзамен' },
  }[lang];

  // ── Time left (updates every 30 s) ──
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  const leftText = (ms: number) => {
    const total = Math.max(0, Math.floor((ms - now) / 60000));
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    return d > 0 ? `${d} ${T.d} ${h} ${T.h}` : h > 0 ? `${h} ${T.h} ${m} ${T.m}` : `${m} ${T.m}`;
  };
  /** draft: not sent yet, open: running, closed: time is over, legacy: old exam without a deadline */
  const stateOf = (e: Exam): 'draft' | 'open' | 'closed' | 'legacy' => {
    if (e.published === false) return 'draft';
    if (typeof e.expiresAtMs === 'number') return now <= e.expiresAtMs ? 'open' : 'closed';
    return 'legacy';
  };
  const visibleExams = isTeacher ? exams : exams.filter(e => e.published !== false);

  useEffect(() => {
    const examsQuery = query(collection(db, 'exams'), orderBy('createdAt', 'desc'));
    const unsubExams = onSnapshot(examsQuery, (snap) => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'exams'));

    let unsubSubmissions: () => void = () => {};
    if (isTeacher) {
      const subsQuery = query(collection(db, 'exam_submissions'), orderBy('submittedAt', 'desc'));
      unsubSubmissions = onSnapshot(subsQuery, (snap) => {
        setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamSubmission)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'exam_submissions'));
    } else {
      const subsQuery = query(collection(db, 'exam_submissions'), where('studentId', '==', user.uid));
      unsubSubmissions = onSnapshot(subsQuery, (snap) => {
        setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamSubmission)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'exam_submissions'));
    }

    return () => {
      unsubExams();
      unsubSubmissions();
    };
  }, [isTeacher, user.uid]);

  const handleCreateExam = async () => {
    if (!newExam.title || newExam.questions.length === 0) return;
    try {
      await addDoc(collection(db, 'exams'), {
        ...newExam,
        teacherId: user.uid,
        teacherName: user.name,
        active: true,
        published: false,
        createdAt: new Date().toISOString()
      });
      setNotice('İmtahan yaradıldı. Şagirdlərə göndərmək üçün kartdakı «Göndər» düyməsini basın.');
      setView('list');
      setNewExam({ title: '', description: '', questions: [] });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'exams');
    }
  };

  const addQuestionToNewExam = () => {
    if (!newQuestion.text || newQuestion.options.some(o => !o)) return;
    setNewExam(prev => ({
      ...prev,
      questions: [...prev.questions, { ...newQuestion, id: Math.random().toString(36).substr(2, 9) }]
    }));
    setNewQuestion({ text: '', options: ['', '', '', ''], correctIndex: 0 });
  };

  const handleSubmitExam = async (given: { [questionId: string]: string | number }) => {
    if (!activeExam) return;
    if (typeof activeExam.expiresAtMs === 'number' && Date.now() > activeExam.expiresAtMs) {
      setNotice(lang === 'ru' ? 'Срок сдачи экзамена истёк.' : 'İmtahanın müddəti bitib, cavablar qəbul olunmur.');
      leaveExam();
      return;
    }

    const answers = activeExam.questions.map(q => ({
      questionId: q.id,
      selectedOption: given[q.id] as number,
      isCorrect: given[q.id] === q.correctIndex
    }));

    const score = answers.filter(a => a.isCorrect).length;

    try {
      await addDoc(collection(db, 'exam_submissions'), {
        examId: activeExam.id,
        examTitle: activeExam.title,
        studentId: user.uid,
        studentName: user.name,
        studentUsername: user.username || user.id,
        answers,
        score,
        totalQuestions: activeExam.questions.length,
        submittedAt: new Date().toISOString()
      });
      leaveExam();
    } catch (err) {
      setNotice(lang === 'ru' ? 'Не удалось отправить ответы. Возможно, срок истёк.' : 'Cavablar göndərilmədi. Müddət bitmiş ola bilər.');
      leaveExam();
      try { handleFirestoreError(err, OperationType.CREATE, 'exam_submissions'); } catch {}
    }
  };

  // One click adds the prepared exam to the platform under the teacher's own account.
  const [notice, setNotice] = useState('');
  const addReadyExam = async () => {
    const ready = ISLAM_EXAM_MEDIUM;
    if (exams.some(e => e.title === ready.title)) {
      setNotice('Bu imtahan artıq əlavə olunub.');
      return;
    }
    if (!window.confirm(`Добавить «${ready.title}» (вопросов: ${ready.questions.length})?`)) return;
    try {
      await addDoc(collection(db, 'exams'), {
        title: ready.title,
        description: ready.description,
        questions: ready.questions,
        translations: ready.translations,
        teacherId: user.uid,
        teacherName: user.name,
        active: true,
        published: false,
        createdAt: new Date().toISOString(),
      });
      setNotice('İmtahan əlavə olundu (rus tərcüməsi ilə). Şagirdlərə göndərmək üçün kartdakı «Göndər» düyməsini basın.');
    } catch (err) {
      setNotice('Əlavə olunmadı. Firestore qaydalarını dərc etdiyinizi yoxlayın.');
      handleFirestoreError(err, OperationType.CREATE, 'exams');
    }
  };


  // ── Teacher: review answers and write marks to the journal ──
  const [resultExamId, setResultExamId] = useState('');
  const [subjectId, setSubjectId] = useState('eqide');
  const [draftMarks, setDraftMarks] = useState<Record<string, string>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  const shownResults = submissions.filter(sub => !resultExamId || sub.examId === resultExamId);
  const markOf = (sub: ExamSubmission) => draftMarks[sub.id] || sub.gradeMark || suggestMark(sub.score, sub.totalQuestions);

  const writeMark = async (sub: ExamSubmission) => {
    const mark = markOf(sub);
    const today = new Date().toLocaleDateString('sv-SE');
    // fixed id = no duplicates; writing again simply replaces the earlier mark
    await setDoc(doc(db, 'journal_v2', `exam_${sub.id}`), {
      studentId: sub.studentId,
      subjectId,
      date: today,
      mark,
      type: 'daily',
      source: 'exam',
      examId: sub.examId,
      teacherId: user.uid,
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'exam_submissions', sub.id), {
      gradeMark: mark,
      gradedAt: new Date().toISOString(),
      gradedBy: user.name,
    });
    await addDoc(collection(db, 'notifications'), {
      userId: sub.studentId,
      title: 'İmtahan qiyməti',
      message: `«${sub.examTitle}»: ${sub.score}/${sub.totalQuestions}. Ваша оценка: ${mark}`,
      type: 'success',
      read: false,
      createdAt: new Date().toISOString(),
    });
  };

  const writeOne = async (sub: ExamSubmission) => {
    try {
      await writeMark(sub);
      setNotice(`${sub.studentName}: оценка ${markOf(sub)} выставлена в журнал.`);
    } catch (err) {
      setNotice('Jurnala yazılmadı. Firestore qaydalarını dərc etdiyinizi yoxlayın.');
      try { handleFirestoreError(err, OperationType.WRITE, 'journal_v2'); } catch {}
    }
  };

  const writeAll = async () => {
    const todo = shownResults.filter(sub => !sub.gradeMark);
    if (todo.length === 0) return;
    const subj = SUBJECTS.find(x => x.id === subjectId)?.name || subjectId;
    if (!window.confirm(`Выставить в журнал оценки (${todo.length}) по предмету «${subj}»?`)) return;
    try {
      for (const sub of todo) await writeMark(sub);
      setNotice(`Оценок выставлено в журнал: ${todo.length}. Ученикам отправлены уведомления.`);
    } catch (err) {
      setNotice('Bəzi qiymətlər yazılmadı. Firestore qaydalarını dərc etdiyinizi yoxlayın.');
      try { handleFirestoreError(err, OperationType.WRITE, 'journal_v2'); } catch {}
    }
  };

  // One button: opens the exam for 2 days and notifies every student.
  const EXAM_DAYS = 2;
  const sendExam = async (exam: Exam) => {
    const again = exam.published !== false;
    const msg = again
      ? `Отправить экзамен «${exam.title}» снова? Срок с этого момента: ${EXAM_DAYS} дн.`
      : `Отправить экзамен «${exam.title}» всем ученикам? Срок: ${EXAM_DAYS} дн.`;
    if (!window.confirm(msg)) return;
    const startMs = Date.now();
    const expiresAtMs = startMs + EXAM_DAYS * 24 * 60 * 60 * 1000;
    try {
      await updateDoc(doc(db, 'exams', exam.id), {
        published: true,
        publishedAt: new Date(startMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
      });
      const students = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
      let batch = writeBatch(db);
      let count = 0;
      for (const s of students.docs) {
        batch.set(doc(collection(db, 'notifications')), {
          userId: s.id,
          title: 'Yeni imtahan',
          message: `Экзамен «${exam.title}» открыт. Сдайте до ${fmtDate(expiresAtMs)}.`,
          type: 'info',
          read: false,
          createdAt: new Date().toISOString(),
        });
        count++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      await batch.commit();
      setNotice(`Отправлено. Уведомлений: ${students.size}. Экзамен открыт до ${fmtDate(expiresAtMs)}.`);
    } catch (err) {
      setNotice('Göndərilmədi. Firestore qaydalarını dərc etdiyinizi yoxlayın.');
      try { handleFirestoreError(err, OperationType.UPDATE, `exams/${exam.id}`); } catch {}
    }
  };

  const deleteExam = async (id: string) => {
    if (!window.confirm('Bu imtahanı silmək istəyirsiniz?')) return;
    try {
      await deleteDoc(doc(db, 'exams', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${id}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-[200] flex flex-col">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-brand/10 rounded-xl flex items-center justify-center text-brand">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text">{T.title}</h3>
              <p className="text-[11px] text-muted font-semibold ">
                {view === 'list' ? T.available : 
                 view === 'create' ? 'Yeni imtahan yarat' : 
                 view === 'take' ? activeExam?.title : 'Nəticələr'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {false && view === 'list' && (
              <div className="flex rounded-full bg-neutral-100 dark:bg-neutral-800 p-0.5 text-[11px]">
                {([['az', 'AZ'], ['ru', 'RU']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setLang(id)}
                    className={`px-2.5 py-1 rounded-full transition-colors ${lang === id ? 'bg-surface text-text shadow-sm font-medium' : 'text-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {isTeacher && view === 'list' && (
              <button 
                onClick={() => setView('create')}
                className="bg-brand text-white px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center space-x-1.5"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>Yarat</span>
              </button>
            )}
            {isTeacher && view === 'list' && (
              <button
                onClick={addReadyExam}
                className="bg-neutral-100 text-muted px-3 py-1.5 rounded-xl text-[11px] font-semibold hover:bg-neutral-200 transition-all"
              >
                Hazır imtahan: İslam əsasları
              </button>
            )}
            {isTeacher && view === 'list' && (
              <button 
                onClick={() => setView('results')}
                className="bg-neutral-50 dark:bg-neutral-900 text-muted px-3 py-1.5 rounded-xl text-[11px] font-semibold hover:bg-neutral-200 transition-all"
              >
                Nəticələr
              </button>
            )}
            {(view !== 'list') && (
              <button 
                onClick={leaveExam}
                className="p-1.5 hover:bg-neutral-50 dark:bg-neutral-900 rounded-xl transition-colors text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {view === 'list' && (
              <button onClick={onClose} className="p-1.5 hover:bg-neutral-50 dark:bg-neutral-900 rounded-xl transition-colors text-muted">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {notice && view === 'list' && (
          <div className="px-4 py-2 text-xs text-brand-700 bg-brand-50 border-b border-border">{notice}</div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-background">
          <AnimatePresence mode="wait">
            {view === 'list' && (
              <motion.div 
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {visibleExams.length === 0 ? (
                  <div className="col-span-full py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-neutral-50 dark:bg-neutral-900 rounded-full flex items-center justify-center mx-auto text-slate-300">
                      <ClipboardList className="w-8 h-8" />
                    </div>
                    <p className="text-muted text-sm font-medium">{T.none}</p>
                  </div>
                ) : (
                  visibleExams.map(exam => {
                    const mySub = submissions.find(s => s.examId === exam.id && s.studentId === user.uid);
                    const hasSubmitted = !!mySub;
                    const st = stateOf(exam);
                    const ru = lang === 'ru' ? exam.translations?.ru : undefined;
                    const shownTitle = ru?.title || exam.title;
                    const shownDesc = ru?.description || exam.description;
                    return (
                      <div key={exam.id} className="bg-neutral-50 dark:bg-neutral-900 border border-border p-6 rounded-2xl hover:border-brand/20 transition-all group">
                        <div className="flex justify-between items-start mb-4">
                          <div className="space-y-1 min-w-0">
                            <h4 className="font-semibold text-text group-hover:text-brand transition-colors">{shownTitle}</h4>
                            <p className="text-xs text-muted line-clamp-2">{shownDesc}</p>
                          </div>
                          {isTeacher && (
                            <button onClick={() => deleteExam(exam.id)} className="p-2 text-muted hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {isTeacher && (
                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                              st === 'open' ? 'bg-green-50 text-green-700' : st === 'closed' ? 'bg-red-50 text-red-600' : st === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-muted'
                            }`}>
                              {st === 'draft' && 'Göndərilməyib'}
                              {st === 'open' && `Открыт · осталось ${leftText(exam.expiresAtMs as number)}`}
                              {st === 'closed' && 'Müddət bitib'}
                              {st === 'legacy' && 'Müddətsiz'}
                            </span>
                            {exam.translations?.ru && <span className="px-2.5 py-1 rounded-full text-[11px] bg-brand-50 text-brand-700">RU tərcümə var</span>}
                            <button onClick={() => sendExam(exam)} className="btn-primary !px-4 !py-1.5 !text-[11px]">
                              <Send className="w-3 h-3" />
                              <span>{st === 'draft' ? 'Göndər · 2 gün' : 'Yenidən göndər (+2 gün)'}</span>
                            </button>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1 text-[11px] font-semibold text-muted">
                              <ClipboardList className="w-3 h-3" />
                              <span>{exam.questions.length} {T.questions}</span>
                            </div>
                            {!isTeacher && st === 'open' && (
                              <div className="flex items-center space-x-1 text-[11px] font-semibold text-muted">
                                <Clock className="w-3 h-3" />
                                <span>{T.left}: {leftText(exam.expiresAtMs as number)}</span>
                              </div>
                            )}
                            {isTeacher && (
                              <div className="flex items-center space-x-1 text-[11px] font-semibold text-muted">
                                <UserIcon className="w-3 h-3" />
                                <span>{exam.teacherName}</span>
                              </div>
                            )}
                          </div>
                          {hasSubmitted ? (
                            <div className="flex items-center space-x-1 text-[11px] font-semibold text-green-500">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{T.done}{mySub?.gradeMark ? ` · Оценка: ${mySub.gradeMark}` : ''}</span>
                            </div>
                          ) : st === 'closed' && !isTeacher ? (
                            <span className="text-[11px] font-semibold text-red-500">{T.closed}</span>
                          ) : (
                            <button 
                              onClick={() => { setActiveExam(exam); setView('take'); }}
                              className="bg-white border border-border text-text px-4 py-2 rounded-xl text-[11px] font-semibold hover:bg-brand hover:text-white hover:border-brand transition-all flex items-center space-x-2"
                            >
                              <span>{T.start}</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}

            {view === 'create' && (
              <motion.div 
                key="create"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="İmtahan adı"
                    value={newExam.title}
                    onChange={e => setNewExam(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full text-2xl font-semibold text-text placeholder:text-slate-200 outline-none border-b border-border focus:border-brand transition-all pb-2"
                  />
                  <textarea 
                    placeholder="Təsvir (isteğe bağlı)"
                    value={newExam.description}
                    onChange={e => setNewExam(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full text-sm text-muted placeholder:text-slate-200 outline-none resize-none h-12"
                  />
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-900 p-6 rounded-2xl border border-border space-y-6">
                  <h5 className="text-[11px] font-semibold text-text">Sual Əlavə Et</h5>
                  <div className="space-y-4">
                    <input 
                      type="text" 
                      placeholder="Sual mətni"
                      value={newQuestion.text}
                      onChange={e => setNewQuestion(prev => ({ ...prev, text: e.target.value }))}
                      className="w-full p-4 rounded-2xl border border-border focus:border-brand outline-none transition-all text-sm"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {newQuestion.options.map((opt, idx) => (
                        <div key={idx} className="flex items-center space-x-3 bg-white p-3 rounded-2xl border border-border">
                          <input 
                            type="radio" 
                            name="correct" 
                            checked={newQuestion.correctIndex === idx}
                            onChange={() => setNewQuestion(prev => ({ ...prev, correctIndex: idx }))}
                            className="accent-brand w-4 h-4"
                          />
                          <input 
                            type="text" 
                            placeholder={`Вариант ${idx + 1}`}
                            value={opt}
                            onChange={e => {
                              const newOpts = [...newQuestion.options];
                              newOpts[idx] = e.target.value;
                              setNewQuestion(prev => ({ ...prev, options: newOpts }));
                            }}
                            className="flex-1 text-sm outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={addQuestionToNewExam}
                      className="w-full bg-white border border-border text-text py-3 rounded-xl text-[11px] font-semibold hover:border-brand hover:text-brand transition-all flex items-center justify-center space-x-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Sualı siyahıya əlavə et</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="text-[11px] font-semibold text-text">Sual Siyahısı ({newExam.questions.length})</h5>
                  {newExam.questions.map((q, idx) => (
                    <div key={q.id} className="flex items-center justify-between p-4 bg-white border border-border rounded-2xl">
                      <div className="flex items-center space-x-4">
                        <span className="text-xs font-semibold text-brand">#{idx + 1}</span>
                        <p className="text-sm font-medium text-text truncate max-w-[400px]">{q.text}</p>
                      </div>
                      <button 
                        onClick={() => setNewExam(prev => ({ ...prev, questions: prev.questions.filter(item => item.id !== q.id) }))}
                        className="p-2 text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleCreateExam}
                  disabled={!newExam.title || newExam.questions.length === 0}
                  className="w-full bg-brand text-white py-4 rounded-2xl font-semibold text-xs transition-all disabled:opacity-50"
                >
                  İmtahanı Yarat
                </button>
              </motion.div>
            )}

            {view === 'take' && activeExam && (
              <motion.div
                key="take"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 bg-background z-[300] overflow-y-auto p-4 md:p-8"
              >
                {(() => {
                  const ruTr = activeExam.translations?.ru;
                  const useRu = lang === 'ru' && !!ruTr;
                  const view_qs = activeExam.questions.map(q => {
                    const t = useRu ? ruTr!.questions.find(x => x.id === q.id) : undefined;
                    return { id: q.id, text: t?.text ?? q.text, type: 'choice' as const, options: t?.options ?? q.options, correctIndex: q.correctIndex };
                  });
                  return (
                    <TaskSolver
                      title={useRu ? ruTr!.title : activeExam.title}
                      subtitle={useRu ? ruTr!.description : activeExam.description || `${activeExam.questions.length} вопр.`}
                      questions={view_qs}
                      submitLabel={T.submit}
                      lang={useRu ? 'ru' : 'az'}
                      onLangChange={undefined}
                      draftKey={`exam_draft_${activeExam.id}_${user.uid}`}
                      onBack={leaveExam}
                      onSubmit={payload => handleSubmitExam(payload.answers)}
                    />
                  );
                })()}
              </motion.div>
            )}

            {view === 'results' && isTeacher && (
              <motion.div 
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-neutral-50 dark:bg-neutral-900 p-6 rounded-2xl border border-border">
                    <div className="flex items-center space-x-3 text-brand mb-2">
                      <Award className="w-4 h-4" />
                      <span className="text-[11px] font-semibold ">Cəmi Cavab</span>
                    </div>
                    <div className="text-3xl font-semibold text-text">{submissions.length}</div>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-900 p-6 rounded-2xl border border-border">
                    <div className="flex items-center space-x-3 text-green-500 mb-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-[11px] font-semibold ">Ortalama Bal</span>
                    </div>
                    <div className="text-3xl font-semibold text-text">
                      {submissions.length > 0 
                        ? (submissions.reduce((acc, curr) => acc + (curr.score / curr.totalQuestions), 0) / submissions.length * 100).toFixed(0)
                        : 0}%
                    </div>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-900 p-6 rounded-2xl border border-border">
                    <div className="flex items-center space-x-3 text-brand-500 mb-2">
                      <Clock className="w-4 h-4" />
                      <span className="text-[11px] font-semibold ">Son Aktivlik</span>
                    </div>
                    <div className="text-xs font-semibold text-text ">
                      {submissions.length > 0 ? new Date(submissions[0].submittedAt).toLocaleDateString() : '-'}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h5 className="text-sm font-semibold text-text mr-auto">Tələbə nəticələri</h5>
                    <select
                      value={resultExamId}
                      onChange={e => setResultExamId(e.target.value)}
                      className="px-3 py-2 text-xs bg-surface border border-border rounded-xl outline-none text-text"
                    >
                      <option value="">Bütün imtahanlar</option>
                      {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      Jurnal fənni:
                      <select
                        value={subjectId}
                        onChange={e => setSubjectId(e.target.value)}
                        className="px-3 py-2 text-xs bg-surface border border-border rounded-xl outline-none text-text"
                      >
                        {SUBJECTS.map(sb => <option key={sb.id} value={sb.id}>{sb.name}</option>)}
                      </select>
                    </label>
                    <button
                      onClick={writeAll}
                      disabled={shownResults.every(x => !!x.gradeMark)}
                      className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Hamısını jurnala yaz ({shownResults.filter(x => !x.gradeMark).length})</span>
                    </button>
                  </div>
                  <p className="text-xs text-muted">
                    Təklif olunan qiymət: 90%+ — «5», 73%+ — «4», 53%+ — «3», daha az — «2». Qiyməti dəyişə bilərsiniz.
                  </p>

                  <div className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-border overflow-hidden divide-y divide-border">
                    {shownResults.length === 0 && <div className="p-8 text-center text-xs text-muted">Hələ cavab yoxdur</div>}
                    {shownResults.map(sub => {
                      const exam = exams.find(e => e.id === sub.examId);
                      const percent = Math.round((sub.score / Math.max(1, sub.totalQuestions)) * 100);
                      const isOpen = openRow === sub.id;
                      return (
                        <div key={sub.id}>
                          <div className="p-4 flex flex-wrap items-center gap-4">
                            <div className="flex items-center space-x-3 min-w-[180px] flex-1">
                              <div className="w-8 h-8 bg-brand-50 rounded-full flex items-center justify-center text-brand-600">
                                <UserIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-text truncate">{sub.studentName}</div>
                                <div className="text-[11px] text-muted truncate">{sub.examTitle} · {new Date(sub.submittedAt).toLocaleDateString('ru-RU')}</div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 w-36">
                              <div className="flex-1 bg-neutral-200 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-brand h-full rounded-full" style={{ width: `${percent}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-brand whitespace-nowrap">{sub.score}/{sub.totalQuestions} · {percent}%</span>
                            </div>
                            <select
                              value={markOf(sub)}
                              onChange={e => setDraftMarks(m => ({ ...m, [sub.id]: e.target.value }))}
                              className="px-3 py-2 text-sm font-semibold bg-surface border border-border rounded-xl outline-none text-text"
                              aria-label="Qiymət"
                            >
                              {['5', '4', '3', '2'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <button onClick={() => writeOne(sub)} className={sub.gradeMark ? 'btn-secondary' : 'btn-primary'}>
                              {sub.gradeMark ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /><span>Yazılıb: {sub.gradeMark} · yenilə</span></> : <span>Jurnala yaz</span>}
                            </button>
                            <button onClick={() => setOpenRow(isOpen ? null : sub.id)} className="btn-secondary">
                              {isOpen ? 'Gizlət' : 'Cavablar'}
                            </button>
                          </div>

                          {isOpen && (
                            <div className="px-4 pb-4">
                              {!exam ? (
                                <p className="text-xs text-muted">İmtahan silinib, suallar göstərilə bilmir.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {exam.questions.map((q, i) => {
                                    const a = sub.answers.find(x => x.questionId === q.id);
                                    const ok = !!a?.isCorrect;
                                    return (
                                      <div key={q.id} className={`rounded-xl px-3 py-2 text-xs flex gap-3 ${ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                        <span className="font-semibold w-6 shrink-0">{i + 1}.</span>
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium">{q.text}</div>
                                          <div className="mt-0.5">
                                            Cavab: {a ? q.options[a.selectedOption] ?? '—' : '—'}
                                            {!ok && <span className="ml-2 opacity-80">· Düzgün: {q.options[q.correctIndex]}</span>}
                                          </div>
                                        </div>
                                        {ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
