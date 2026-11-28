
import React, { useState, useEffect } from 'react';
import { User, LibraryItem, ExtraCourse, CourseEnrollment, Language } from '../types';
import { db, auth } from '../firebase';
import { 
    collection, query, where, onSnapshot, addDoc, 
    serverTimestamp, deleteDoc, doc, getDocs 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { 
    BookOpen, GraduationCap, Plus, X, Loader2, 
    Search, Globe, Calendar, Users, CheckCircle2, 
    AlertCircle, MessageSquare, Quote, Heart, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toast, ToastType } from '../components/Toast';

interface ExtraProps {
    user: User;
}

type Tab = 'library' | 'courses';

export const Extra: React.FC<ExtraProps> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<Tab>('library');
    const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
    const [courses, setCourses] = useState<ExtraCourse[]>([]);
    const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });

    // Library Form State
    const [newLibraryItem, setNewLibraryItem] = useState({
        title: '',
        content: '',
        category: 'Hədis',
        language: (user.language || 'az') as Language
    });

    // Course Form State
    const [newCourse, setNewCourse] = useState({
        title: '',
        description: '',
        schedule: '',
        lessonLink: ''
    });

    useEffect(() => {
        if (!user || !user.uid) return;
        setLoading(true);
        
        // Fetch Library Items
        const libRef = collection(db, 'library_items');
        const libQuery = query(libRef, where('language', '==', user.language || 'az'));
        const unsubLib = onSnapshot(libQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryItem));
            setLibraryItems(items);
        }, (err) => {
            console.error("Library Items Error:", err);
            handleFirestoreError(err, OperationType.LIST, 'library_items');
        });

        // Fetch Courses
        const courseRef = collection(db, 'extra_courses');
        const unsubCourse = onSnapshot(courseRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraCourse));
            setCourses(items);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'extra_courses'));

        // Fetch Enrollments
        const enrollRef = collection(db, 'course_enrollments');
        const enrollQuery = user.role === 'student' 
          ? query(enrollRef, where('studentId', '==', user.uid))
          : query(enrollRef);
        
        const unsubEnroll = onSnapshot(enrollQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CourseEnrollment));
            setEnrollments(items);
            setLoading(false);
        }, (err) => {
            console.error("Enrollments Error:", err);
            handleFirestoreError(err, OperationType.LIST, 'course_enrollments');
        });

        return () => {
            unsubLib();
            unsubCourse();
            unsubEnroll();
        };
    }, [user.language]);

    const handleAddLibraryItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLibraryItem.title || !newLibraryItem.content) return;
        setIsSaving(true);
        try {
            await addDoc(collection(db, 'library_items'), {
                ...newLibraryItem,
                teacherId: user.uid,
                teacherName: user.name,
                createdAt: serverTimestamp()
            });
            setShowAddModal(false);
            setNewLibraryItem({ title: '', content: '', category: 'Hədis', language: (user.language || 'az') as Language });
            setToast({ visible: true, message: 'Uğurla əlavə edildi', type: 'success' });
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCourse.title || !newCourse.description || !newCourse.schedule || !newCourse.lessonLink) {
            setToast({ visible: true, message: 'Bütün xanaları doldurun', type: 'error' });
            return;
        }
        setIsSaving(true);
        try {
            await addDoc(collection(db, 'extra_courses'), {
                ...newCourse,
                teacherId: user.uid,
                teacherName: user.name,
                createdAt: serverTimestamp()
            });
            setShowAddModal(false);
            setNewCourse({ title: '', description: '', schedule: '', lessonLink: '' });
            setToast({ visible: true, message: 'Kurs yaradıldı', type: 'success' });
        } catch (err) {
            console.error(err);
            setToast({ visible: true, message: 'Xəta baş verdi', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEnroll = async (courseId: string) => {
        if (enrollments.some(e => e.courseId === courseId && e.studentId === user.uid)) {
            setToast({ visible: true, message: 'Artıq qeydiyyatdan keçmisiniz', type: 'error' });
            return;
        }

        try {
            await addDoc(collection(db, 'course_enrollments'), {
                courseId,
                studentId: user.uid,
                studentName: user.name,
                studentClass: user.class || 'Неизвестно',
                enrolledAt: serverTimestamp()
            });
            setToast({ visible: true, message: 'Qeydiyyat tamamlandı', type: 'success' });
        } catch (err) {
            console.error(err);
        }
    };

    const isEnrolled = (courseId: string) => enrollments.some(e => e.courseId === courseId && e.studentId === user.uid);

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    <p className="text-[11px] font-semibold text-muted ">Məlumatlar yüklənir...</p>
                </div>
            ) : (
                <>
            <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-5">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-text">Digər Bölmələr</h1>
                    <p className="text-xs text-muted mt-0.5">Bilik xəzinəsi və kurslar</p>
                </div>
                <div className="flex bg-surface p-1 rounded-xl border border-border shadow-sm">
                    <button 
                        onClick={() => setActiveTab('library')}
                        className={`px-4 py-2 rounded-xl text-[11px] font-semibold transition-all ${activeTab === 'library' ? 'bg-brand text-white' : 'text-muted hover:text-text'}`}
                    >
                        Bilik Xəzinəsi
                    </button>
                    <button 
                        onClick={() => setActiveTab('courses')}
                        className={`px-4 py-2 rounded-xl text-[11px] font-semibold transition-all ${activeTab === 'courses' ? 'bg-brand text-white' : 'text-muted hover:text-text'}`}
                    >
                        Əlavə Kurslar
                    </button>
                </div>
            </header>

            <AnimatePresence mode="wait">
                {activeTab === 'library' ? (
                    <motion.div 
                        key="library"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                    >
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-text tracking-tight flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-brand" /> Bilik Xəzinəsi
                            </h2>
                            {user.role === 'teacher' && (
                                <button 
                                    onClick={() => setShowAddModal(true)}
                                    className="bg-brand text-white px-4 py-2 rounded-xl font-semibold text-[11px] hover:opacity-95 transition-all flex items-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Əlavə Et
                                </button>
                            )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {libraryItems.length === 0 ? (
                                <div className="col-span-full py-12 text-center bg-surface rounded-2xl border border-dashed border-border">
                                    <Quote className="w-8 h-8 text-muted/20 mx-auto mb-2" />
                                    <p className="text-muted font-semibold text-[11px] ">Hələlik heç bir məlumat yoxdur.</p>
                                </div>
                            ) : (
                                libraryItems.map(item => (
                                    <div key={item.id} className="bg-surface border border-border rounded-2xl p-6 shadow-sm transition-all group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Quote className="w-12 h-12" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="px-2 py-0.5 bg-brand/10 text-brand rounded-full text-[11px] font-semibold ">{item.category}</span>
                                            <span className="text-[11px] font-semibold text-muted ">{item.language.toUpperCase()}</span>
                                        </div>
                                        <h3 className="text-base font-semibold text-text mb-3 tracking-tight">{item.title}</h3>
                                        <p className="text-[11px] text-muted leading-relaxed font-medium mb-6 ">"{item.content}"</p>
                                        <div className="pt-4 border-t border-border flex justify-between items-center">
                                            <span className="text-[11px] font-semibold text-muted ">{item.teacherName}</span>
                                            <Heart className="w-3.5 h-3.5 text-muted/20" />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="courses"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                    >
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-text tracking-tight flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-brand" /> Əlavə Kurslar
                            </h2>
                            {user.role === 'teacher' && (
                                <button 
                                    onClick={() => setShowAddModal(true)}
                                    className="bg-brand text-white px-4 py-2 rounded-xl font-semibold text-[11px] hover:opacity-95 transition-all flex items-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Kurs Yarat
                                </button>
                            )}
                        </div>

                        <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
                            {courses.length === 0 ? (
                                <div className="col-span-full py-12 text-center bg-surface rounded-2xl border border-dashed border-border">
                                    <Star className="w-8 h-8 text-muted/20 mx-auto mb-2" />
                                    <p className="text-muted font-semibold text-[11px] ">Hələlik heç bir kurs yoxdur.</p>
                                </div>
                            ) : (
                                courses.map(course => {
                                    const enrolledCount = enrollments.filter(e => e.courseId === course.id).length;
                                    const enrolled = isEnrolled(course.id || '');
                                    
                                    return (
                                        <div key={course.id} className="bg-surface border border-border rounded-2xl p-5 shadow-sm transition-all flex flex-col gap-4 overflow-hidden">
                                            <div className="flex items-start gap-4">
                                                <div className="w-16 h-16 bg-background rounded-xl flex items-center justify-center border border-border shrink-0">
                                                    <GraduationCap className="w-6 h-6 text-brand" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-1 gap-4">
                                                        <h3 className="text-base font-semibold text-text tracking-tight truncate">{course.title}</h3>
                                                        <div className="flex items-center gap-1 text-[11px] font-semibold text-muted shrink-0">
                                                            <Users className="w-3 h-3" /> {enrolledCount}
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] text-muted font-medium mb-3 line-clamp-2">{course.description}</p>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <div className="flex items-center gap-1 text-[11px] font-semibold text-brand ">
                                                            <Calendar className="w-3 h-3" /> {course.schedule}
                                                        </div>
                                                        <div className="text-[11px] font-semibold text-muted ">
                                                            {course.teacherName}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col gap-2 pt-3 border-t border-border w-full">
                                                {course.lessonLink && (
                                                    <a 
                                                        href={course.lessonLink} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="w-full h-10 px-4 rounded-xl font-semibold text-[11px] transition-all flex items-center justify-center gap-2 bg-brand-500 text-white shadow-sm hover:opacity-95"
                                                    >
                                                        <Globe className="w-3 h-3" /> ONLAYN DƏRS
                                                    </a>
                                                )}
                                                {user.role === 'student' ? (
                                                    <button 
                                                        onClick={() => handleEnroll(course.id || '')}
                                                        disabled={enrolled}
                                                        className={`w-full h-10 px-4 rounded-xl font-semibold text-[11px] transition-all flex items-center justify-center gap-2 ${enrolled ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-brand text-white shadow-sm hover:opacity-95'}`}
                                                    >
                                                        {enrolled ? (
                                                            <><CheckCircle2 className="w-3 h-3" /> QEYDİYYATDAN KEÇİLDİ</>
                                                        ) : (
                                                            'Qeydiyyatdan keç'
                                                        )}
                                                    </button>
                                                ) : (
                                                    <div className="w-full flex flex-wrap gap-1">
                                                        {enrollments.filter(e => e.courseId === course.id).map(e => (
                                                            <span key={e.id} className="px-2 py-0.5 bg-background border border-border rounded text-[11px] font-semibold text-text ">
                                                                {e.studentName}
                                                            </span>
                                                        ))}
                                                        {enrolledCount === 0 && <span className="text-[11px] font-semibold text-muted px-2">Hələlik heç kim yoxdur</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/20 animate-fade-in">
                    <div className="bg-surface w-full max-w-lg rounded-2xl shadow-md overflow-hidden flex flex-col border border-border">
                        <div className="p-5 border-b border-border flex justify-between items-center">
                            <h2 className="text-base font-semibold text-text tracking-tight">
                                {activeTab === 'library' ? 'Yeni Bilik' : 'Yeni Kurs'}
                            </h2>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-background rounded-xl transition-colors">
                                <X className="w-4 h-4 text-muted" />
                            </button>
                        </div>
                        
                        <form onSubmit={activeTab === 'library' ? handleAddLibraryItem : handleAddCourse} className="p-5 space-y-4">
                            {activeTab === 'library' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted ml-1">Başlıq</label>
                                            <input 
                                                required 
                                                className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text focus:border-brand/10 outline-none transition-all"
                                                value={newLibraryItem.title}
                                                onChange={e => setNewLibraryItem({...newLibraryItem, title: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted ml-1">Kateqoriya</label>
                                            <select 
                                                className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text focus:border-brand/10 outline-none transition-all"
                                                value={newLibraryItem.category}
                                                onChange={e => setNewLibraryItem({...newLibraryItem, category: e.target.value})}
                                            >
                                                <option value="Hədis">Hədis</option>
                                                <option value="Ayə">Ayə</option>
                                                <option value="Hikmətli Söz">Hikmətli Söz</option>
                                                <option value="Tarixi Fakt">Tarixi Fakt</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-muted ml-1">Məzmun</label>
                                        <textarea 
                                            required 
                                            className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text min-h-[100px] focus:border-brand/10 outline-none transition-all"
                                            value={newLibraryItem.content}
                                            onChange={e => setNewLibraryItem({...newLibraryItem, content: e.target.value})}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-muted ml-1">Kursun Adı</label>
                                        <input 
                                            required 
                                            className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text focus:border-brand/10 outline-none transition-all"
                                            value={newCourse.title}
                                            onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-muted ml-1">Təsvir</label>
                                        <textarea 
                                            required 
                                            className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text min-h-[80px] focus:border-brand/10 outline-none transition-all"
                                            value={newCourse.description}
                                            onChange={e => setNewCourse({...newCourse, description: e.target.value})}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted ml-1">Cədvəl</label>
                                            <input 
                                                required 
                                                placeholder="Məs: Şənbə 14:00"
                                                className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text focus:border-brand/10 outline-none transition-all"
                                                value={newCourse.schedule}
                                                onChange={e => setNewCourse({...newCourse, schedule: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted ml-1">Dərs Linki *</label>
                                            <input 
                                                required 
                                                type="url"
                                                placeholder="Meet/Zoom linki"
                                                className="w-full bg-background border border-border rounded-2xl p-3 text-[11px] font-semibold text-text focus:border-brand/10 outline-none transition-all"
                                                value={newCourse.lessonLink}
                                                onChange={e => setNewCourse({...newCourse, lessonLink: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            <button 
                                type="submit" 
                                disabled={isSaving}
                                className="w-full bg-brand text-white py-3.5 rounded-xl font-semibold text-[11px] disabled:opacity-50 transition-all flex items-center justify-center"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Yadda saxla"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
            </>
            )}
        </div>
    );
};
