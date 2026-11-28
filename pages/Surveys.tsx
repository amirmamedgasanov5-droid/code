import React, { useState, useEffect } from 'react';
import { User, Survey, SurveyResponse } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, addDoc, doc, deleteDoc, where, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { ClipboardList, Plus, X, Loader2, Trash2, Users, CheckCircle2, AlertCircle, User as UserIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toast } from '../components/Toast';

interface SurveysProps {
  user: User;
}

export const Surveys: React.FC<SurveysProps> = ({ user }) => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [loading, setLoading] = useState(true);
  const [newSurvey, setNewSurvey] = useState({ 
    title: '', 
    description: '', 
    mandatory: true,
    questions: [{ id: '1', text: '', type: 'choice' as 'choice' | 'text', options: ['Bəli', 'Xeyr'] }] 
  });

  useEffect(() => {
    if (user.role === 'student') {
      const q = query(collection(db, 'survey_responses'), where('studentUid', '==', user.uid));
      const unsub = onSnapshot(q, (snap) => {
        setAnsweredIds(new Set(snap.docs.map(d => d.data().surveyId)));
      });
      return () => unsub();
    }
  }, [user.uid, user.role]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    const q = query(collection(db, 'surveys'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSurveys(snap.docs.map(d => ({ id: d.id, ...d.data() } as Survey)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'surveys');
      showToast("Məlumatları yükləyərkən xəta baş verdi", "error");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedSurveyId && user.role === 'teacher') {
      const q = query(collection(db, 'survey_responses'), where('surveyId', '==', selectedSurveyId));
      const unsub = onSnapshot(q, (snap) => {
        setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() } as SurveyResponse)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'survey_responses');
      });
      return () => unsub();
    }
  }, [selectedSurveyId, user.role]);

  const handleAddSurvey = async () => {
    if (!newSurvey.title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const cleanedQuestions = newSurvey.questions.map(q => ({
        ...q,
        options: q.options?.map(opt => opt.trim()).filter(opt => opt !== '') || []
      }));

      await addDoc(collection(db, 'surveys'), {
        ...newSurvey,
        questions: cleanedQuestions,
        active: true,
        createdAt: new Date().toISOString()
      });
      setShowForm(false);
      setNewSurvey({ title: '', description: '', mandatory: true, questions: [{ id: '1', text: '', type: 'choice' as 'choice' | 'text', options: ['Bəli', 'Xeyr'] }] });
      showToast("Sorğu yaradıldı", "success");
    } catch (error: any) {
      console.error("Error adding survey:", error);
      showToast(error.message || "Xəta baş verdi", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'surveys', id), { active: !current });
    } catch (error: any) {
      showToast(error.message || "Xəta baş verdi", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bu sorğunu silmək istədiyinizə əminsiniz?")) return;
    try {
      await deleteDoc(doc(db, 'surveys', id));
      showToast("Sorğu silindi", "success");
    } catch (error: any) {
      showToast("Xəta baş verdi", "error");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast 
        isVisible={toast.visible} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast({...toast, visible: false})} 
      />

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-neutral-800 pb-5">
        <div>
          <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400 block mb-0.5">
            Mədrəsə Rəyləri
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            Sorğular və Qiymətləndirmə
          </h1>
        </div>

        {user.role === 'teacher' && (
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn-primary text-xs font-medium px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showForm ? "Ləğv et" : "Yeni Sorğu"}</span>
          </button>
        )}
      </header>

      {/* New Survey Form Animation */}
      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0, overflow: 'hidden' }} 
            animate={{ opacity: 1, height: 'auto', overflow: 'visible' }} 
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }} 
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 space-y-4 "
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Sorğu Başlığı</label>
                <input 
                  className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium outline-none focus:border-brand-500 transition-colors text-neutral-900 dark:text-neutral-100" 
                  placeholder="Məsələn: Tədris keyfiyyətinin qiymətləndirilməsi" 
                  value={newSurvey.title} 
                  onChange={e => setNewSurvey({...newSurvey, title: e.target.value})} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Təsvir</label>
                <textarea 
                  className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-normal outline-none focus:border-brand-500 transition-colors text-neutral-900 dark:text-neutral-100 resize-none" 
                  placeholder="Sorğunun məqsədi və qeydlər..." 
                  rows={2} 
                  value={newSurvey.description} 
                  onChange={e => setNewSurvey({...newSurvey, description: e.target.value})} 
                />
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                <input 
                  type="checkbox" 
                  id="mandatory" 
                  checked={newSurvey.mandatory} 
                  onChange={e => setNewSurvey({...newSurvey, mandatory: e.target.checked})}
                  className="w-3.5 h-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="mandatory" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
                  Məcburi Sorğu (Tələbə cavablandırmayana qədər platformada göstərilir)
                </label>
              </div>
            </div>

            {/* Questions list */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">Suallar</p>
              {newSurvey.questions.map((q, idx) => (
                <div key={idx} className="p-3 bg-neutral-50/70 dark:bg-neutral-800/30 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] font-medium text-neutral-500">Sual {idx + 1}</label>
                      <input 
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium outline-none text-neutral-900 dark:text-neutral-100" 
                        placeholder="Sualı qeyd edin..." 
                        value={q.text} 
                        onChange={e => {
                          const qs = [...newSurvey.questions];
                          qs[idx].text = e.target.value;
                          setNewSurvey({...newSurvey, questions: qs});
                        }} 
                      />
                    </div>
                    <div className="sm:w-36 space-y-1">
                      <label className="text-[11px] font-medium text-neutral-500">Növ</label>
                      <select 
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium outline-none text-neutral-900 dark:text-neutral-100" 
                        value={q.type} 
                        onChange={e => {
                          const qs = [...newSurvey.questions];
                          qs[idx].type = e.target.value as any;
                          setNewSurvey({...newSurvey, questions: qs});
                        }}
                      >
                        <option value="choice">Variantlı</option>
                        <option value="text">Açıq mətn</option>
                      </select>
                    </div>
                  </div>
                  {q.type === 'choice' && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-medium text-neutral-500">Variantlar</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options?.map((opt, optIdx) => (
                          <div key={optIdx} className="relative group">
                            <input 
                              className="w-full bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 pr-8 text-xs font-medium outline-none text-neutral-900 dark:text-neutral-100"
                              placeholder={`Вариант ${optIdx + 1}`}
                              value={opt}
                              onChange={e => {
                                const qs = [...newSurvey.questions];
                                qs[idx].options![optIdx] = e.target.value;
                                setNewSurvey({...newSurvey, questions: qs});
                              }}
                            />
                            {q.options!.length > 2 && (
                              <button 
                                type="button"
                                onClick={() => {
                                  const qs = [...newSurvey.questions];
                                  qs[idx].options = qs[idx].options!.filter((_, i) => i !== optIdx);
                                  setNewSurvey({...newSurvey, questions: qs});
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-rose-500 transition-colors cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        {q.options!.length < 6 && (
                          <button 
                            type="button"
                            onClick={() => {
                              const qs = [...newSurvey.questions];
                              qs[idx].options = [...qs[idx].options!, ''];
                              setNewSurvey({...newSurvey, questions: qs});
                            }}
                            className="flex items-center justify-center gap-1.5 p-2 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Variant Əlavə Et
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button 
                onClick={() => setNewSurvey({...newSurvey, questions: [...newSurvey.questions, { id: Date.now().toString(), text: '', type: 'choice', options: ['Bəli', 'Xeyr'] }]})} 
                className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 flex items-center gap-1.5 cursor-pointer py-1"
              >
                <Plus className="w-3.5 h-3.5" /> Sual əlavə et
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={handleAddSurvey} 
                disabled={isSubmitting} 
                className="btn-primary text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
                <span>Sorğunu Paylaş</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Surveys List */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
          <p className="text-xs tabular-nums text-neutral-400 ">Sorğular yüklənir...</p>
        </div>
      ) : surveys.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-xl space-y-2">
          <ClipboardList className="w-8 h-8 text-neutral-400 mx-auto" />
          <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">Hələlik heç bir sorğu yoxdur</h3>
          <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
            Müəllimlər sorğu yaratdıqda burada görünəcək.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-200/60 dark:divide-neutral-800/60 ">
          {surveys.map(s => {
            const isAnswered = answeredIds.has(s.id);
            const isExpanded = selectedSurveyId === s.id;

            return (
              <div key={s.id} className="p-4 transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-850/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0 border border-neutral-200/80 dark:border-neutral-700">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                          {s.title}
                        </h3>
                        {s.mandatory && (
                          <span className="text-[11px] tabular-nums px-1.5 py-0.2 rounded bg-brand-600 text-white">
                            Məcburi
                          </span>
                        )}
                        <span className="text-[11px] tabular-nums text-neutral-400">
                          {new Date(s.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      {s.description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {user.role === 'teacher' ? (
                      <>
                        <button
                          onClick={() => toggleStatus(s.id, s.active)}
                          className={`px-2 py-1 rounded text-xs tabular-nums transition-colors cursor-pointer border ${
                            s.active 
                              ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/40 dark:text-brand-400 dark:border-brand-900/40' 
                              : 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'
                          }`}
                        >
                          {s.active ? 'Aktiv' : 'Deaktiv'}
                        </button>
                        <button
                          onClick={() => setSelectedSurveyId(isExpanded ? null : s.id)}
                          className="btn-secondary text-xs font-medium px-2.5 py-1 rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <Users className="w-3 h-3 text-neutral-500" />
                          <span>Nəticələr</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1 text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        {isAnswered ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-900/40">
                            <CheckCircle2 className="w-3 h-3" /> Tamamlanıb
                          </span>
                        ) : s.active ? (
                          <button 
                            onClick={() => window.dispatchEvent(new CustomEvent('open-survey-modal', { detail: s.id }))}
                            className="btn-primary text-xs font-medium px-3 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer"
                          >
                            <ClipboardList className="w-3 h-3" /> Keç
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-400 tabular-nums">Bağlıdır</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Teacher Responses View with AnimatePresence */}
                {user.role === 'teacher' && (
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                        className="mt-4 pt-4 border-t border-neutral-200/60 dark:border-neutral-800/60 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                            Tələbə Cavabları ({responses.length})
                          </span>
                        </div>

                        {responses.length > 0 ? (
                          <div className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl overflow-hidden bg-neutral-50/50 dark:bg-neutral-850/30">
                            {responses.map(r => (
                              <div key={r.id} className="p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5 font-medium text-neutral-900 dark:text-neutral-100">
                                    <UserIcon className="w-3 h-3 text-neutral-400" />
                                    <span>{r.studentName}</span>
                                  </div>
                                  <span className="text-[11px] tabular-nums text-neutral-400">
                                    {new Date(r.submittedAt).toLocaleString('ru-RU')}
                                  </span>
                                </div>
                                <div className="grid gap-1.5 text-xs">
                                  {Object.entries(r.answers).map(([qid, ans]) => {
                                    const question = s.questions.find(q => q.id === qid);
                                    return (
                                      <div key={qid} className="text-xs">
                                        <span className="text-neutral-500">{question?.text}: </span>
                                        <span className="font-medium text-neutral-900 dark:text-neutral-100">{ans}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                            Hələlik cavab göndərilməyib
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
