import React, { useEffect, useState, useRef } from 'react';
import { User, Banner, Announcement, Lesson, Notification, Homework, GlobalMessage, ExtraCourse } from '../types';
import { 
  Calendar as CalendarIcon, ChevronRight, Plus, X, Loader2, 
  ExternalLink, Trophy, ShieldCheck, Send, Search,
  BookOpen, Clock, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, limit, getDocs, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { Toast } from '../components/Toast';
import { BannerCarousel } from '../components/BannerCarousel';
import { isStaffUser } from '../src/utils/roles';
import { formatTodayAz } from '../src/utils/date';

interface DashboardProps {
  user: User;
}

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<Lesson[]>([]);
  const [extraCourses, setExtraCourses] = useState<ExtraCourse[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [globalMessages, setGlobalMessages] = useState<GlobalMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [banners, setBanners] = useState<Banner[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAnnounce, setNewAnnounce] = useState({ title: '', content: '', priority: 'medium' as 'low'|'medium'|'high' });
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    const annQuery = query(collection(db, 'announcements'), orderBy('date', 'desc'), limit(10));
    const unsubAnn = onSnapshot(annQuery, (snap) => {
      setAnnouncements(snap.docs
        .filter(d => d.id !== '_leaderboard_data_')
        .map(d => ({ id: d.id, ...d.data() } as Announcement))
        .slice(0, 8)
      );
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
      setLoading(false);
    });

    const unsubBanners = onSnapshot(query(collection(db, 'banners'), orderBy('createdAt', 'desc'), limit(10)), (snap) => {
      setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)).filter(b => b.active !== false));
    }, (error) => {
      console.error('banners listener:', error);
    });

    const dayIndex = new Date().getDay();
    const adjustedDay = dayIndex === 0 ? 7 : dayIndex;
    const unsubSched = onSnapshot(collection(db, 'lessons'), (snap) => {
      const today = snap.docs
        .map(d => {
          const data = d.data();
          const daysOfWeek = data.daysOfWeek || (data.dayOfWeek ? [data.dayOfWeek] : []);
          return { id: d.id, ...data, daysOfWeek } as Lesson;
        })
        .filter(l => l.daysOfWeek?.includes(adjustedDay))
        .sort((a, b) => a.time.localeCompare(b.time));
      setTodaySchedule(today);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lessons');
      setLoading(false);
    });

    const hwQuery = query(collection(db, 'homeworks'), orderBy('dueDate', 'asc'), limit(15));
    const unsubHw = onSnapshot(hwQuery, (snap) => {
      const filtered = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Homework))
        .filter(h => h.status === 'active')
        .slice(0, 4);
      setHomeworks(filtered);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'homeworks');
    });

    const msgQuery = query(collection(db, 'global_messages'), orderBy('createdAt', 'asc'), limit(40));
    const unsubMsg = onSnapshot(msgQuery, (snap) => {
      setGlobalMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as GlobalMessage)));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'global_messages');
    });

    const unsubExtra = onSnapshot(collection(db, 'extra_courses'), (snap) => {
      setExtraCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtraCourse)));
    });

    const enrollQuery = query(collection(db, 'course_enrollments'), where('studentId', '==', user.uid));
    const unsubEnroll = onSnapshot(enrollQuery, (snap) => {
      setEnrolledCourseIds(new Set(snap.docs.map(d => d.data().courseId)));
    });

    return () => {
      unsubAnn();
      unsubBanners();
      unsubSched();
      unsubHw();
      unsubMsg();
      unsubExtra();
      unsubEnroll();
    };
  }, [user.uid]);

  const handleSendGlobalMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const text = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'global_messages'), {
        senderId: user.uid,
        senderName: user.name,
        text: text,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Global message error:", error);
      setNewMessage(text);
    }
  };

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnounce.title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title: newAnnounce.title,
        content: newAnnounce.content,
        priority: newAnnounce.priority,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.docs.forEach(async (uDoc) => {
        const userData = uDoc.data();
        if (userData.role === 'student') {
          await addDoc(collection(db, 'notifications'), {
            userId: uDoc.id,
            title: "Yeni Elan",
            message: newAnnounce.title,
            type: 'info',
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      });
      setShowForm(false);
      setNewAnnounce({ title: '', content: '', priority: 'medium' });
      showToast("Elan uğurla dərc edildi", "success");
    } catch (error) {
      console.error("Dashboard error:", error);
      showToast("Elan əlavə edilərkən xəta baş verdi", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLessonOngoing = (timeRange: string) => {
    try {
      const [start, end] = timeRange.split(' - ');
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;
      
      return currentTime >= startTime && currentTime <= endTime;
    } catch (e) {
      return false;
    }
  };

  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const filteredAnnouncements = announcements.filter(a => 
    !searchQuery.trim() || 
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todayLabel = formatTodayAz();
  const firstName = user.name ? user.name.split(' ')[0] : '';
  const formatDue = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
  };
  const typeLabel: Record<string, string> = { homework: 'Ev tapşırığı', classwork: 'Sinif işi', mock: 'Sınaq', test: 'Nəzarət', notes: 'Konspekt' };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16 text-text">
      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            Xoş gəlmisiniz{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-xs text-muted mt-0.5 capitalize">{todayLabel}</p>
        </div>
      </header>

      <BannerCarousel banners={banners} />

      {/* Teacher: new announcement */}
      {isStaffUser(user) && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni elan</span>
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAddAnnouncement} className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Yeni elan</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted hover:text-text">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              placeholder="Elanın başlığı"
              value={newAnnounce.title}
              onChange={(e) => setNewAnnounce({ ...newAnnounce, title: e.target.value })}
              className="sm:col-span-2 w-full px-3.5 py-2.5 text-xs bg-surface border border-border rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              required
            />
            <select
              value={newAnnounce.priority}
              onChange={(e: any) => setNewAnnounce({ ...newAnnounce, priority: e.target.value })}
              className="w-full px-3 py-2.5 text-xs bg-surface border border-border rounded-xl outline-none text-text"
            >
              <option value="low">Aşağı prioritet</option>
              <option value="medium">Orta prioritet</option>
              <option value="high">Yüksək (təcili)</option>
            </select>
          </div>
          <textarea
            placeholder="Elanın mətni"
            value={newAnnounce.content}
            onChange={(e) => setNewAnnounce({ ...newAnnounce, content: e.target.value })}
            rows={3}
            className="w-full px-3.5 py-2.5 text-xs bg-surface border border-border rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Ləğv et</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-50">
              {isSubmitting ? 'Dərc edilir...' : 'Dərc et'}
            </button>
          </div>
        </form>
      )}

      {/* My tasks + My courses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Tapşırıqlarım</h2>
            <button onClick={() => navigate('/homework')} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
              Hamısı <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="card !p-0 overflow-hidden">
            {homeworks.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">Aktiv tapşırıq yoxdur</div>
            ) : (
              <div className="divide-y divide-border">
                {homeworks.map((hw) => (
                  <button
                    key={hw.id}
                    onClick={() => navigate('/homework')}
                    className="w-full text-left px-5 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors flex items-start justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted">{typeLabel[hw.type] || 'Tapşırıq'}</div>
                      <div className="text-sm font-medium text-text truncate">{hw.subject || hw.title}</div>
                    </div>
                    <div className="text-[11px] text-muted whitespace-nowrap">Son tarix: {formatDue(hw.dueDate)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Kurslarım</h2>
            <button onClick={() => navigate('/extra')} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
              Hamısı <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {extraCourses.length === 0 ? (
            <div className="card text-center text-xs text-muted py-8">Hələlik kurs yoxdur</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {extraCourses.slice(0, 4).map((c) => {
                const enrolled = enrolledCourseIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate('/extra')}
                    className="card card-hover text-left flex flex-col justify-between gap-4 min-h-[148px] cursor-pointer"
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-text leading-snug line-clamp-2">{c.title}</h3>
                      <p className="text-xs text-muted line-clamp-2">{c.schedule}</p>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted truncate">Müəllim: {c.teacherName}</span>
                      <span className={`px-2 py-0.5 rounded-xl font-medium ${enrolled ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'bg-neutral-100 text-muted dark:bg-neutral-800'}`}>
                        {enrolled ? 'Qeydiyyatdasınız' : 'Açıqdır'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Schedule */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold tracking-tight">
            Bugünkü cədvəl <span className="text-sm font-normal text-muted">· {todaySchedule.length} dərs</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Elanlarda axtar"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 w-44 sm:w-56 placeholder:text-muted"
              />
            </div>
            <button onClick={() => navigate('/schedule')} className="btn-secondary">
              Tam cədvəl <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {todaySchedule.length === 0 ? (
          <div className="card text-center text-xs text-muted py-8">Bu gün üçün dərs yoxdur</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {todaySchedule.map((lesson) => {
              const isOngoing = isLessonOngoing(lesson.time);
              return (
                <div
                  key={lesson.id}
                  className={`card !p-4 space-y-2.5 ${isOngoing ? 'border-brand-300 dark:border-brand-700 bg-brand-50/40 dark:bg-brand-950/20' : ''}`}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-muted">{lesson.time}</span>
                    {isOngoing && <span className="px-2 py-0.5 rounded-xl bg-brand-600 text-white font-medium">Canlı</span>}
                    {lesson.room && <span className="text-muted truncate">{lesson.room}</span>}
                  </div>
                  <h3 className="text-sm font-semibold text-text leading-snug">{lesson.subject}</h3>
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span className="truncate">{lesson.teacherName}</span>
                    {lesson.lessonLink ? (
                      <a href={lesson.lessonLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        Qoşul <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span>Oflayn</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Announcements + calendar/chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Elanlar</h2>
            <span className="text-xs text-muted">{filteredAnnouncements.length} записей</span>
          </div>
          <div className="card !p-0 overflow-hidden divide-y divide-border">
            {filteredAnnouncements.map((ann) => (
              <div key={ann.id} className="p-5 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text leading-snug">{ann.title}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {ann.priority === 'high' && (
                      <span className="text-[11px] font-medium text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-xl">Təcili</span>
                    )}
                    <span className="text-[11px] text-muted">{ann.date || 'Bu gün'}</span>
                  </div>
                </div>
                <p className="text-xs text-muted leading-relaxed">{ann.content}</p>
              </div>
            ))}
            {filteredAnnouncements.length === 0 && (
              <div className="p-8 text-center text-xs text-muted">Elan tapılmadı</div>
            )}
          </div>

          <div className="card flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center text-brand-600 dark:text-brand-300">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-text">Rütbə və liqa reytinqi</h4>
                <p className="text-xs text-muted">Davamiyyət və qiymətlər üzrə təsnifat</p>
              </div>
            </div>
            <button onClick={() => navigate('/leagues')} className="btn-secondary shrink-0">Reytinq</button>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={handlePrevMonth} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-muted transition-colors" aria-label="Əvvəlki ay">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <button onClick={handleNextMonth} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-muted transition-colors" aria-label="Növbəti ay">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {days.map(d => (
                <span key={d} className="text-[11px] text-muted py-1">{d}</span>
              ))}
              {Array.from({ length: getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => {
                const day = i + 1;
                const isToday = day === new Date().getDate() &&
                               currentDate.getMonth() === new Date().getMonth() &&
                               currentDate.getFullYear() === new Date().getFullYear();
                return (
                  <div
                    key={day}
                    className={`text-xs py-1.5 rounded-xl transition-colors ${
                      isToday ? 'bg-brand-600 text-white font-semibold' : 'text-text hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card space-y-3 flex flex-col h-[300px]">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-sm font-semibold text-text">Ümumi çat</span>
              <span className="text-[11px] text-muted">Bütün istifadəçilər</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
              {globalMessages.map((msg, idx) => {
                const isMe = msg.senderId === user.uid;
                return (
                  <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`px-3 py-2 rounded-xl max-w-[85%] text-xs ${
                      isMe ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-text'
                    }`}>
                      {!isMe && <p className="text-[11px] font-medium opacity-60 mb-0.5">{msg.senderName}</p>}
                      <p className="leading-snug">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendGlobalMessage} className="relative">
              <input
                type="text"
                placeholder="Mesaj yazın..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl py-2.5 px-3.5 pr-10 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-600 p-1.5 disabled:opacity-30 cursor-pointer"
                aria-label="Göndər"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
