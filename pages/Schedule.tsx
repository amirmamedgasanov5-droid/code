import React, { useEffect, useState, useMemo } from 'react';
import { Lesson, User, Language } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { Plus, X, Loader2, Video, CalendarDays, ExternalLink, Clock, MapPin, Globe } from 'lucide-react';
import { translations } from '../i18n';
import { motion, AnimatePresence } from 'motion/react';

interface ScheduleProps {
  user: User;
}

export const Schedule: React.FC<ScheduleProps> = ({ user }) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLang, setFilterLang] = useState<Language | 'all'>('all');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');

  const t = translations[user.language || 'ru'];

  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newLesson, setNewLesson] = useState({
    subject: '',
    teacherName: user.role === 'teacher' ? user.name : '',
    startTime: '',
    endTime: '',
    daysOfWeek: [] as number[],
    room: '',
    lessonLink: '',
    language: (user.language || 'ru') as Language
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lessons'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        const daysOfWeek = docData.daysOfWeek || (docData.dayOfWeek ? [docData.dayOfWeek] : []);
        return { id: doc.id, ...docData, daysOfWeek } as Lesson;
      });
      setLessons(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lessons');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newLesson.daysOfWeek.length === 0) {
      alert("Ən azı bir gün seçin");
      return;
    }
    setIsSubmitting(true);
    try {
      const formattedTime = `${newLesson.startTime}${newLesson.endTime ? ' - ' + newLesson.endTime : ''}`;
      await addDoc(collection(db, 'lessons'), {
        subject: newLesson.subject,
        teacherName: newLesson.teacherName,
        time: formattedTime,
        daysOfWeek: newLesson.daysOfWeek,
        room: newLesson.room || 'Onlayn',
        lessonLink: newLesson.lessonLink,
        language: newLesson.language
      });
      setShowForm(false);
      setNewLesson(prev => ({ ...prev, subject: '', startTime: '', endTime: '', room: '', lessonLink: '', daysOfWeek: [] }));
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDay = (day: number) => {
    setNewLesson(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day) 
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day]
    }));
  };

  const filteredLessons = useMemo(() => {
    let result = lessons;
    if (filterLang !== 'all') {
      result = result.filter(l => l.language === filterLang);
    }
    if (selectedDay !== 'all') {
      result = result.filter(l => l.daysOfWeek?.includes(selectedDay));
    }
    return result;
  }, [lessons, filterLang, selectedDay]);

  const langList: { id: Language | 'all'; label: string }[] = [
    { id: 'all', label: 'Bütün dillər' },
    { id: 'az', label: 'Азербайджанский' },
    { id: 'ru', label: 'Русский' },
    { id: 'ar', label: 'Арабский' },
    { id: 'tr', label: 'Турецкий' },
    { id: 'en', label: 'Английский' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          <p className="text-xs tabular-nums text-neutral-400 ">Məlumatlar yüklənir...</p>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-200/80 dark:border-neutral-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
                  Tədris Planı
                </span>
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-text">
                {t.schedule}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Language Segmented Control */}
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/60 p-1 rounded-xl border border-neutral-200/60 dark:border-neutral-800 overflow-x-auto max-w-full">
                {langList.map(l => {
                  const isSelected = filterLang === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setFilterLang(l.id)}
                      className={`relative px-2.5 py-1 text-xs font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'text-neutral-900 dark:text-neutral-100 font-semibold'
                          : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
                      }`}
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="schedule-lang-pill"
                          className="absolute inset-0 bg-white dark:bg-neutral-900 rounded-xl  border border-neutral-200/80 dark:border-neutral-800"
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        />
                      )}
                      <span className="relative z-10">{l.label}</span>
                    </button>
                  );
                })}
              </div>

              {user.role === 'teacher' && (
                <button 
                  onClick={() => setShowForm(!showForm)}
                  className="btn-primary text-xs font-medium px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer ml-auto"
                >
                  {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{showForm ? t.cancel : "Yeni Dərs"}</span>
                </button>
              )}
            </div>
          </header>

          {/* Day Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar border-b border-neutral-200/60 dark:border-neutral-800/60">
            <button
              onClick={() => setSelectedDay('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                selectedDay === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Bütün Günlər ({lessons.length})
            </button>
            {t.days.map((dayName, idx) => {
              const dayNum = idx + 1;
              const count = lessons.filter(l => l.daysOfWeek?.includes(dayNum)).length;
              const isSelected = selectedDay === dayNum;
              return (
                <button
                  key={dayNum}
                  onClick={() => setSelectedDay(dayNum)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span>{dayName}</span>
                  <span className={`text-[11px] tabular-nums px-1 rounded ${isSelected ? 'bg-white/20 text-white dark:bg-neutral-900/20 dark:text-neutral-900' : 'text-neutral-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Form Expansion with AnimatePresence */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <form onSubmit={handleAddLesson} className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 space-y-4 ">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">{t.subject}</label>
                      <input 
                        required 
                        className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-brand-500 transition-colors" 
                        placeholder="Fənn adı" 
                        value={newLesson.subject} 
                        onChange={e => setNewLesson({...newLesson, subject: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2 lg:col-span-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Dərs günləri</label>
                      <div className="flex flex-wrap gap-1 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-1.5">
                        {t.days.map((day, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDay(idx + 1)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                              newLesson.daysOfWeek.includes(idx + 1)
                                ? 'bg-brand-600 text-white'
                                : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                            }`}
                          >
                            {day.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Dil</label>
                      <select 
                        className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-brand-500 transition-colors" 
                        value={newLesson.language} 
                        onChange={e => setNewLesson({...newLesson, language: e.target.value as Language})}
                      >
                        <option value="az">Азербайджанский</option>
                        <option value="ru">Русский</option>
                        <option value="ar">Арабский</option>
                        <option value="tr">Турецкий</option>
                        <option value="en">Английский</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Video Link</label>
                      <input 
                        required 
                        type="url" 
                        className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-brand-500 transition-colors" 
                        placeholder="Zoom/Meet link" 
                        value={newLesson.lessonLink} 
                        onChange={e => setNewLesson({...newLesson, lessonLink: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Otaq / Sinif</label>
                      <input 
                        className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none" 
                        placeholder="Onlayn və ya Otaq 3" 
                        value={newLesson.room} 
                        onChange={e => setNewLesson({...newLesson, room: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Başlama vaxtı</label>
                      <input 
                        required 
                        type="time" 
                        className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none" 
                        value={newLesson.startTime} 
                        onChange={e => setNewLesson({...newLesson, startTime: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Bitiş vaxtı</label>
                      <input 
                        required 
                        type="time" 
                        className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none" 
                        value={newLesson.endTime} 
                        onChange={e => setNewLesson({...newLesson, endTime: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button 
                      type="submit" 
                      disabled={isSubmitting} 
                      className="btn-primary text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{t.save}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Schedule View: Minimalist Data Grid matching Ali's reference */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${filterLang}-${selectedDay}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              {t.days.map((dayName, index) => {
                const dayNum = index + 1;
                if (selectedDay !== 'all' && selectedDay !== dayNum) return null;

                const dayLessons = filteredLessons
                  .filter((l) => l.daysOfWeek?.includes(dayNum))
                  .sort((a, b) => a.time.localeCompare(b.time));

                return (
                  <div key={dayName} className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden ">
                    {/* Day Header Row */}
                    <div className="flex items-center justify-between px-4 py-3 bg-neutral-50/70 dark:bg-neutral-800/30 border-b border-neutral-200/80 dark:border-neutral-800">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-xl bg-neutral-200/80 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-[11px] tabular-nums flex items-center justify-center font-medium">
                          {dayNum}
                        </span>
                        <h3 className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 tracking-wide">
                          {dayName}
                        </h3>
                      </div>
                      <span className="text-[11px] tabular-nums text-neutral-400">
                        {dayLessons.length} dərs
                      </span>
                    </div>

                    {/* Horizontal rows - no vertical dividers (Ali style) */}
                    {dayLessons.length > 0 ? (
                      <div className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">
                        {dayLessons.map((lesson) => (
                          <div 
                            key={lesson.id} 
                            className="px-4 py-3 hover:bg-neutral-50/50 dark:hover:bg-neutral-850/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                          >
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                              <span className="inline-flex items-center gap-1 tabular-nums text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-200/60 dark:border-neutral-700/60 whitespace-nowrap">
                                <Clock className="w-3 h-3 text-neutral-400" />
                                {lesson.time}
                              </span>
                              <div className="min-w-0">
                                <h4 className="font-medium text-neutral-900 dark:text-neutral-100 text-xs truncate">
                                  {lesson.subject}
                                </h4>
                                <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                                  <span>{lesson.teacherName}</span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-2.5 h-2.5 text-neutral-400" />
                                    {lesson.room || 'Onlayn'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                              <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded border border-neutral-200/80 dark:border-neutral-800 text-neutral-500">
                                {lesson.language}
                              </span>
                              {lesson.lessonLink && (
                                <a
                                  href={lesson.lessonLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-secondary text-xs font-medium px-2.5 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer text-neutral-700 dark:text-neutral-300"
                                >
                                  <Video className="w-3 h-3 text-neutral-500" />
                                  <span>Qoşul</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-500 font-normal">
                        {t.no_lessons}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
