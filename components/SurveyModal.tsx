
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { User, Survey, SurveyResponse } from '../types';
import { CheckCircle2, ClipboardList, Loader2, Send, Bookmark, X } from 'lucide-react';
import { Toast } from './Toast';

interface SurveyModalProps {
  user: User;
}

export const SurveyModal: React.FC<SurveyModalProps> = ({ user }) => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [currentSurveyIndex, setCurrentSurveyIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [loadingSurveys, setLoadingSurveys] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(true);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  useEffect(() => {
    if (user.role !== 'student') {
      setLoadingSurveys(false);
      setLoadingResponses(false);
      return;
    }

    const surveysQuery = query(collection(db, 'surveys'), where('active', '==', true));
    const responsesQuery = query(
      collection(db, 'survey_responses'), 
      where('studentUid', '==', user.uid)
    );

    const unsubSurveys = onSnapshot(surveysQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Survey));
      setSurveys(docs);
      setLoadingSurveys(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'surveys');
      setLoadingSurveys(false);
    });

    const unsubResponses = onSnapshot(responsesQuery, (snapshot) => {
      const ids = new Set(snapshot.docs.map(doc => doc.data().surveyId));
      setAnsweredIds(ids);
      setLoadingResponses(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'survey_responses');
      setLoadingResponses(false);
    });

    return () => {
      unsubSurveys();
      unsubResponses();
    };
  }, [user.uid, user.role]);

  const pendingSurveys = surveys.filter(s => !answeredIds.has(s.id));
  const hasMandatoryPending = pendingSurveys.some(s => s.mandatory);

  useEffect(() => {
    const handleOpen = (e: any) => {
      const surveyId = e.detail;
      if (surveyId) {
        const index = pendingSurveys.findIndex(s => s.id === surveyId);
        if (index !== -1) {
          setCurrentSurveyIndex(index);
        }
      }
      setIsDismissed(false);
      setIsCompleted(false);
    };
    window.addEventListener('open-survey-modal', handleOpen);
    return () => window.removeEventListener('open-survey-modal', handleOpen);
  }, [pendingSurveys]);

  // Reset index if it goes out of bounds
  useEffect(() => {
    if (currentSurveyIndex >= pendingSurveys.length && pendingSurveys.length > 0) {
      setCurrentSurveyIndex(0);
    }
    if (pendingSurveys.length > 0) {
      setIsCompleted(false);
    }
  }, [pendingSurveys.length, currentSurveyIndex]);

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (pendingSurveys.length === 0 || isSubmitting) return;
    const currentSurvey = pendingSurveys[currentSurveyIndex];
    
    const unansweredMandatory = currentSurvey.questions
      .filter(q => q.mandatory !== false)
      .some(q => !answers[q.id]);

    if (unansweredMandatory) {
      setToast({ visible: true, message: "Zəhmət olmasa bütün vacib sualları cavablandırın.", type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure we only send defined values to Firestore
      const cleanedAnswers = Object.fromEntries(
        Object.entries(answers).filter(([_, v]) => v !== undefined && v !== null)
      );

      await addDoc(collection(db, 'survey_responses'), {
        surveyId: currentSurvey.id,
        surveyTitle: currentSurvey.title,
        studentId: user.id,
        studentUid: user.uid,
        studentName: user.name,
        studentUsername: user.username || user.id,
        answers: cleanedAnswers,
        submittedAt: new Date().toISOString()
      });

      setAnswers({});
      if (pendingSurveys.length === 1) {
        setIsCompleted(true);
        setToast({ visible: true, message: "Bütün sorğular uğurla tamamlandı!", type: 'success' });
      } else {
        setToast({ visible: true, message: "Cavabınız qeydə alındı. Növbəti sorğuya keçid edilir...", type: 'success' });
        setCurrentSurveyIndex(0);
      }
    } catch (error: any) {
      console.error("Error submitting survey:", error);
      setToast({ visible: true, message: `Ошибка: ${error.message || "Не удалось отправить"}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toastElement = <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />;

  if (loadingSurveys || loadingResponses) return toastElement;
  if (pendingSurveys.length === 0 && !isCompleted) return toastElement;
  if (isDismissed && !hasMandatoryPending) return toastElement;

  const currentSurvey = pendingSurveys[currentSurveyIndex] || pendingSurveys[0];
  if (!currentSurvey && !isCompleted) return toastElement;

  return (
    <>
      {toastElement}
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/40 ${hasMandatoryPending ? '' : 'pointer-events-auto'}`}
        >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-md overflow-hidden border border-slate-100 dark:border-slate-800 relative"
        >
          {(!hasMandatoryPending || isCompleted) && (
            <button 
              onClick={() => setIsDismissed(true)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {isCompleted ? (
            <div className="p-16 text-center space-y-6">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-900 dark:text-white">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-medium text-slate-900 dark:text-white tracking-tight">Təşəkkür edirik!</h2>
              <p className="text-slate-400 dark:text-slate-500 font-medium text-[11px] ">Bütün vacib sorğuları tamamladınız.</p>
              {!hasMandatoryPending && (
                <button 
                  onClick={() => setIsDismissed(true)}
                  className="mt-4 text-[11px] font-semibold text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Bağla
                </button>
              )}
            </div>
          ) : (
            <div className="p-10 space-y-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-medium text-slate-900 dark:text-white tracking-tight ">{currentSurvey.title}</h2>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">
                      {currentSurvey.mandatory ? 'Məcburi Sorğu' : 'Könüllü Sorğu'} • {currentSurveyIndex + 1}/{pendingSurveys.length}
                    </p>
                  </div>
                </div>
                {user.effectsEnabled && <Bookmark className="w-5 h-5 text-slate-900 dark:text-white" />}
              </div>

              <div className="space-y-10 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                {currentSurvey.questions.map((q, idx) => (
                  <div key={q.id} className="space-y-6">
                    <p className="text-xs font-medium text-slate-900 dark:text-white leading-relaxed">
                      {idx + 1}. {q.text}
                      {q.mandatory !== false && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    
                    {q.type === 'choice' ? (
                      <div className="grid grid-cols-1 gap-3">
                        {q.options?.map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleAnswer(q.id, opt)}
                            className={`p-5 rounded-2xl border text-left text-[11px] font-medium transition-all ${
                              answers[q.id] === opt 
                              ? 'bg-brand-600 border-brand-600 text-white' 
                              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 hover:border-slate-200 dark:hover:border-slate-600'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-6 text-sm font-medium focus:ring-1 focus:ring-slate-900 dark:focus:ring-white outline-none text-slate-900 dark:text-white min-h-[120px]"
                        placeholder="Cavabınızı bura yazın..."
                        value={answers[q.id] || ''}
                        onChange={e => handleAnswer(q.id, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-xl font-medium text-xs flex items-center justify-center gap-3 transition-all disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4" /> Göndər</>}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </>
  );
};
