
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { db, auth } from '../firebase';
import { 
    collection, onSnapshot, addDoc, query, where, orderBy, 
    serverTimestamp, getDocs, setDoc, doc, limit, deleteDoc, updateDoc
} from 'firebase/firestore';
import { checkAchievements } from '../src/utils/achievementService';
import { motion, AnimatePresence } from 'motion/react';
import { 
    ClipboardList, Search, Plus, Minus, Loader2, 
    Calendar, User as UserIcon, CheckCircle2, XCircle, 
    ChevronLeft, ChevronRight, Save, Award as AwardIcon
} from 'lucide-react';
import { Toast, ToastType } from '../components/Toast';

interface Student {
    uid: string;
    name: string;
    surname?: string;
    email?: string;
}

interface JournalEntry {
    id: string;
    studentId: string;
    subjectId: string;
    date: string;
    mark: string;
    type: 'daily' | 'half_year_1' | 'half_year_2' | 'annual';
    teacherId: string;
}

interface JournalV2Props {
    currentUser: User;
}


const SUBJECTS = [
    { id: 'arab-dili', name: 'Ərəb dili', name_ru: 'Арабский язык' },
    { id: 'tecvid', name: 'Təcvid', name_ru: 'Таджвид' },
    { id: 'eqide', name: 'Əqidə', name_ru: 'Акыда' },
    { id: 'fiqh', name: 'Fiqh', name_ru: 'Фикх' },
    { id: 'hedis', name: 'Hədis', name_ru: 'Хадис' },
    { id: 'tefsir', name: 'Təfsir', name_ru: 'Тафсир' },
    { id: 'exlaq', name: 'Əxlaq', name_ru: 'Нравственность' },
    { id: 'sira', name: 'Sira', name_ru: 'Сира' }
];

export const Journal: React.FC<JournalV2Props> = ({ currentUser }) => {
    const isTeacher = currentUser.role === 'teacher' || currentUser.role === 'admin';
    const [students, setStudents] = useState<Student[]>([]);
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });
    
    // Filtering
    const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0].id);
    const [viewType, setViewType] = useState<'month' | 'year'>('month');
    const [viewMode, setViewMode] = useState<'daily' | 'summary'>('daily');

    // Month navigation
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [dates, setDates] = useState<string[]>([]);

    useEffect(() => {
        // Generate dates based on viewType
        if (viewType === 'month') {
            const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
            const monthDates = [];
            for (let i = 1; i <= lastDay.getDate(); i++) {
                const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
                monthDates.push(d.toISOString().split('T')[0]);
            }
            setDates(monthDates);
        } else {
            const yearDates = entries
                .filter(e => e.date.startsWith(currentMonth.getFullYear().toString()) && e.subjectId === selectedSubject && e.type === 'daily')
                .map(e => e.date);
            const uniqueYearDates = Array.from(new Set(yearDates)).sort();
            setDates(uniqueYearDates.length > 0 ? uniqueYearDates : [new Date().toISOString().split('T')[0]]);
        }

        // Fetch Students
        const stuQuery = query(collection(db, 'users'), where('role', '==', 'student'));
        const unsubscribeStudents = onSnapshot(stuQuery, (snap) => {
            setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Student)));
        });

        // Fetch Journal Entries
        // If teacher in summary mode: get all entries to show across subjects
        // If teacher in daily mode: get specific subject
        // If student: get all subjects for them
        const journalQuery = isTeacher 
            ? (viewMode === 'summary' 
                ? query(collection(db, 'journal_v2'))
                : query(collection(db, 'journal_v2'), where('subjectId', '==', selectedSubject)))
            : query(collection(db, 'journal_v2'), where('studentId', '==', currentUser.uid));

        const unsubscribeJournal = onSnapshot(journalQuery, (snap) => {
            setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry)));
            setLoading(false);
        });

        return () => {
            unsubscribeStudents();
            unsubscribeJournal();
        };
    }, [currentMonth, viewType, selectedSubject, isTeacher, currentUser.uid]);

    const handleAddMark = async (studentId: string, mark: string, type: 'daily' | 'half_year_1' | 'half_year_2' | 'annual', date: string) => {
        if (!mark) return;
        setIsSaving(true);
        try {
            // Updated ID to include timestamp for multi-marks support
            const entryId = `${studentId}_${selectedSubject}_${type}_${date}_${Date.now()}`;
            
            await setDoc(doc(db, 'journal_v2', entryId), {
                studentId,
                subjectId: selectedSubject,
                date,
                mark,
                type,
                teacherId: auth.currentUser?.uid,
                updatedAt: new Date().toISOString()
            });

            if (type === 'daily' && mark === '5') {
                await checkAchievements(studentId, (t) => setToast(t as any));
            }

            setToast({ visible: true, message: "Qiymət əlavə edildi", type: 'success' });
        } catch (err: any) {
            setToast({ visible: true, message: "Xəta: " + err.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveMark = async (entryId: string) => {
        setIsSaving(true);
        try {
            await deleteDoc(doc(db, 'journal_v2', entryId));
            setToast({ visible: true, message: "Qiymət silindi", type: 'success' });
        } catch (err: any) {
            setToast({ visible: true, message: "Silinmə zamanı xəta: " + err.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const filteredStudents = isTeacher 
        ? students.filter(s => `${s.name} ${s.surname || ''}`.toLowerCase().includes(searchTerm.toLowerCase()))
        : students.filter(s => s.uid === auth.currentUser?.uid);

    const getMarks = (uid: string, type: string, date: string, subId?: string) => 
        entries.filter(e => e.studentId === uid && e.type === type && e.date === date && e.subjectId === (subId || selectedSubject));

    const [editingCell, setEditingCell] = useState<{sid: string, type: string, date: string} | null>(null);

    const calculateAverage = (uid: string, subId: string) => {
        const relevantMarks = entries
            .filter(e => e.studentId === uid && e.subjectId === subId && e.type === 'daily')
            .map(e => parseInt(e.mark))
            .filter(n => !isNaN(n));
        
        if (relevantMarks.length === 0) return null;
        const avg = relevantMarks.reduce((a, b) => a + b, 0) / relevantMarks.length;
        return avg.toFixed(1);
    };

    const [selectedMarkInfo, setSelectedMarkInfo] = useState<{subName: string, date: string, mark: string} | null>(null);

    // Student specific: All subjects overview
    if (!isTeacher) {
        const globalMarks = entries.filter(e => e.type === 'daily').map(e => parseInt(e.mark)).filter(n => !isNaN(n));
        const globalGPA = globalMarks.length > 0 ? (globalMarks.reduce((a, b) => a + b, 0) / globalMarks.length).toFixed(1) : null;

        return (
            <div className="max-w-6xl mx-auto space-y-6 pb-16">
                <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />
                
                {selectedMarkInfo && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={() => setSelectedMarkInfo(null)}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="relative bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200/80 dark:border-neutral-800 shadow-md max-w-sm w-full text-center space-y-4"
                        >
                            <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-800 dark:text-neutral-200 mx-auto">
                                <AwardIcon className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{selectedMarkInfo.subName}</h3>
                                <p className="text-[11px] text-neutral-500 tabular-nums">{selectedMarkInfo.date}</p>
                            </div>
                            <div className="text-3xl font-semibold tabular-nums text-brand-600 dark:text-brand-400 py-2">
                                {selectedMarkInfo.mark}
                            </div>
                            <button 
                                onClick={() => setSelectedMarkInfo(null)}
                                className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                            >
                                Bağla
                            </button>
                        </motion.div>
                    </div>
                )}
                
                <header className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl">
                            <ClipboardList className="w-5 h-5 text-brand-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight text-text">Mənim Jurnalım</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-brand text-[11px] font-semibold ">Ümumi GPA:</p>
                                <span className="bg-brand text-white px-2 py-0.5 rounded-full text-[11px] font-semibold">{globalGPA || '0.0'}</span>
                            </div>
                        </div>
                    </div>
                    {loading && <div className="flex items-center gap-2 text-[11px] font-semibold text-brand">Yüklənir...</div>}
                </header>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl  overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-brand/20">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="p-6 text-left border-b border-border sticky left-0 bg-white z-10">
                                        <span className="text-[11px] font-semibold text-muted">Fənn</span>
                                    </th>
                                    <th className="p-6 text-left border-b border-border min-w-[250px]">
                                        <span className="text-[11px] font-semibold text-muted">Gündəlik Qiymətlər</span>
                                    </th>
                                    <th className="p-6 text-center border-b border-border w-28">
                                        <span className="text-[11px] font-semibold text-muted">I Yarımil</span>
                                    </th>
                                    <th className="p-6 text-center border-b border-border w-28">
                                        <span className="text-[11px] font-semibold text-muted">II Yarımil</span>
                                    </th>
                                    <th className="p-6 text-center border-b border-border w-28 bg-brand/5">
                                        <span className="text-[11px] font-semibold text-brand">İllik</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {SUBJECTS.map((sub) => {
                                    const subEntries = entries.filter(e => e.subjectId === sub.id && e.type === 'daily');
                                    const h1m = entries.filter(e => e.subjectId === sub.id && e.type === 'half_year_1');
                                    const h2m = entries.filter(e => e.subjectId === sub.id && e.type === 'half_year_2');
                                    const annualm = entries.filter(e => e.subjectId === sub.id && e.type === 'annual');
                                    const avg = calculateAverage(currentUser.uid, sub.id);

                                    return (
                                        <tr key={sub.id} className="hover:bg-slate-50/30 transition-colors border-b border-border/50">
                                            <td className="p-6 sticky left-0 bg-white z-10">
                                                <h3 className="text-xs font-semibold text-text tracking-tight">{currentUser.language === 'ru' ? sub.name_ru : sub.name}</h3>
                                                <p className="text-[11px] font-semibold text-brand mt-1">Ortalama: {avg || '-'}</p>
                                            </td>
                                            <td className="p-6">
                                                <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                                                    {subEntries.slice(-15).sort((a,b) => a.date.localeCompare(b.date)).map((e, idx) => (
                                                        <span 
                                                            key={e.id || idx}
                                                            onClick={() => setSelectedMarkInfo({
                                                                subName: currentUser.language === 'ru' ? sub.name_ru : sub.name,
                                                                date: e.date,
                                                                mark: e.mark
                                                            })}
                                                            className={`w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-semibold border border-border/50 cursor-pointer transition-all ${e.mark === '5' ? 'bg-green-50 text-green-600' : e.mark === '4' ? 'bg-brand-50 text-brand-600' : e.mark === 'q' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-text'}`}
                                                        >
                                                            {e.mark || '·'}
                                                        </span>
                                                    ))}
                                                    {subEntries.length === 0 && <span className="text-[11px] font-semibold text-muted/30 ">Hələlik qiymət yoxdur</span>}
                                                </div>
                                            </td>
                                            <td className="p-6 text-center">
                                                <div className="flex flex-wrap items-center justify-center gap-1">
                                                    {h1m.map(m => <span key={m.id} className="text-sm font-semibold text-slate-700">{m.mark}</span>)}
                                                    {h1m.length === 0 && <span className="text-slate-200 text-xs">-</span>}
                                                </div>
                                            </td>
                                            <td className="p-6 text-center border-x border-border/10">
                                                <div className="flex flex-wrap items-center justify-center gap-1">
                                                    {h2m.map(m => <span key={m.id} className="text-sm font-semibold text-slate-700">{m.mark}</span>)}
                                                    {h2m.length === 0 && <span className="text-slate-200 text-xs">-</span>}
                                                </div>
                                            </td>
                                            <td className="p-6 text-center bg-brand/5">
                                                <div className="flex flex-wrap items-center justify-center gap-1">
                                                    {annualm.map(m => <span key={m.id} className="text-lg font-semibold text-brand">{m.mark}</span>)}
                                                    {annualm.length === 0 && <span className="text-brand/20 text-xs">-</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            <Toast 
                isVisible={toast.visible} 
                message={toast.message} 
                type={toast.type} 
                onClose={() => setToast({ ...toast, visible: false })} 
            />

            {selectedMarkInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-slate-900/40"
                        onClick={() => setSelectedMarkInfo(null)}
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200/80 dark:border-neutral-800 shadow-md max-w-sm w-full text-center space-y-4"
                    >
                        <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-800 dark:text-neutral-200 mx-auto">
                            <AwardIcon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{selectedMarkInfo.subName}</h3>
                            <p className="text-[11px] text-neutral-500 tabular-nums">{selectedMarkInfo.date}</p>
                        </div>
                        <div className="text-3xl font-semibold tabular-nums text-brand-600 dark:text-brand-400 py-2">
                            {selectedMarkInfo.mark}
                        </div>
                        <button 
                            onClick={() => setSelectedMarkInfo(null)}
                            className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                        >
                            Bağla
                        </button>
                    </motion.div>
                </div>
            )}

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl">
                        <ClipboardList className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-text">Elektron Jurnal</h1>
                        <p className="text-xs text-muted mt-0.5">Tam qiymətləndirmə sistemi</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    <select 
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                        className="bg-surface border border-border rounded-2xl py-4 px-6 text-[11px] font-semibold text-text outline-none focus:ring-1 focus:ring-brand shadow-sm"
                    >
                        {SUBJECTS.map(s => (
                            <option key={s.id} value={s.id}>{currentUser.language === 'ru' ? s.name_ru : s.name}</option>
                        ))}
                    </select>

                    <div className="flex bg-surface p-1 rounded-2xl border border-border shadow-sm">
                        <button 
                            onClick={() => { setViewMode('daily'); setViewType('month'); }}
                            className={`px-6 py-2 rounded-xl text-[11px] font-semibold transition-all ${viewMode === 'daily' ? 'bg-brand text-white' : 'text-muted hover:bg-brand/5'}`}
                        >
                            Gündəlik
                        </button>
                        {isTeacher && (
                            <button 
                                onClick={() => setViewMode('summary')}
                                className={`px-6 py-2 rounded-xl text-[11px] font-semibold transition-all ${viewMode === 'summary' ? 'bg-brand text-white' : 'text-muted hover:bg-brand/5'}`}
                            >
                                İllik
                            </button>
                        )}
                    </div>
                </div>

                {viewMode === 'daily' && viewType === 'month' && (
                    <div className="flex bg-surface p-1 rounded-2xl border border-border shadow-sm items-center">
                        <button 
                            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                            className="p-3 hover:bg-brand/5 rounded-xl transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-brand" />
                        </button>
                        <div className="px-6 flex flex-col justify-center items-center min-w-[160px]">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-brand">
                                    {currentMonth.toLocaleDateString(currentUser.language === 'ru' ? 'ru-RU' : 'az-AZ', { month: 'long' })}
                                </span>
                                <select 
                                    value={currentMonth.getFullYear()}
                                    onChange={(e) => setCurrentMonth(new Date(parseInt(e.target.value), currentMonth.getMonth(), 1))}
                                    className="bg-transparent border-none text-[11px] font-semibold text-muted outline-none focus:ring-0 cursor-pointer"
                                >
                                    {[2024, 2025, 2026, 2027].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                            <button 
                                onClick={() => setCurrentMonth(new Date())}
                                className="text-[11px] font-semibold text-brand mt-0.5 hover:underline"
                            >
                                {currentUser.language === 'ru' ? 'Сегодня' : 'Bu gün'}
                            </button>
                        </div>
                        <button 
                            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                            className="p-3 hover:bg-brand/5 rounded-xl transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-brand" />
                        </button>
                    </div>
                )}

                <div className="relative w-full md:w-80">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input 
                        type="text" 
                        placeholder={isTeacher ? "Şagird axtar..." : "Axtarış..."}
                        className="w-full bg-surface border border-border rounded-2xl py-4 pl-12 pr-4 text-[11px] font-semibold text-text outline-none focus:ring-1 focus:ring-brand shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            {viewMode === 'summary' && isTeacher && (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800  overflow-hidden">
                    <div className="p-8 border-b border-border bg-slate-50/50 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-semibold text-text tracking-tight">İllik Xülasə Jurnalı</h2>
                            <p className="text-[11px] font-semibold text-muted mt-1">Bütün fənlər üzrə yekun qiymətlər</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-brand/20">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="p-6 text-left sticky left-0 bg-slate-50 z-20 border-r border-border min-w-[250px]">
                                        <span className="text-[11px] font-semibold text-muted">Şagird</span>
                                    </th>
                                    {SUBJECTS.map(sub => (
                                        <th key={sub.id} className="p-4 text-center border-r border-border min-w-[200px]">
                                            <span className="text-[11px] font-semibold text-muted block mb-1">{currentUser.language === 'ru' ? sub.name_ru : sub.name}</span>
                                            <div className="flex justify-center gap-4 text-[11px] font-semibold text-brand opacity-60">
                                                <span>I Yar</span>
                                                <span>II Yar</span>
                                                <span>İllik</span>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="p-6 text-center bg-brand/5 min-w-[100px]">
                                        <span className="text-[11px] font-semibold text-brand">Ümumi GPA</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((s, sIdx) => {
                                    const allMarks = entries.filter(e => e.studentId === s.uid && e.type === 'daily').map(e => parseInt(e.mark)).filter(n => !isNaN(n));
                                    const globalGpa = allMarks.length > 0 ? (allMarks.reduce((a, b) => a + b, 0) / allMarks.length).toFixed(1) : '-';

                                    return (
                                        <tr key={s.uid} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="p-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-border border-b">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-semibold shadow-sm ${sIdx % 2 === 0 ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-500'}`}>
                                                        {s.name[0]}{s.surname?.[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-xs font-semibold text-text tracking-tight truncate">{s.name} {s.surname}</h3>
                                                        <p className="text-[11px] font-semibold text-muted truncate">Şagird</p>
                                                    </div>
                                                </div>
                                            </td>
                                            {SUBJECTS.map(sub => {
                                                const subAvg = calculateAverage(s.uid, sub.id);
                                                const h1m = getMarks(s.uid, 'half_year_1', 'summary', sub.id);
                                                const h2m = getMarks(s.uid, 'half_year_2', 'summary', sub.id);
                                                const annualm = getMarks(s.uid, 'annual', 'summary', sub.id);

                                                const renderSummaryCell = (type: string, marks: any[], label: string) => {
                                                    const isEditing = editingCell?.sid === s.uid && editingCell?.type === type && editingCell?.date === sub.id;
                                                    return (
                                                        <div className="relative">
                                                            <div 
                                                                onClick={() => setEditingCell(isEditing ? null : {sid: s.uid, type, date: sub.id})}
                                                                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${marks.length > 0 ? 'bg-brand text-white' : 'border border-dashed border-border/60 text-slate-300 hover:border-brand/40'}`}
                                                            >
                                                                {marks.map(m => <span key={m.id} className="text-[11px] font-semibold">{m.mark}</span>)}
                                                                {marks.length === 0 && <span className="text-[11px] font-semibold">?</span>}
                                                            </div>
                                                            <AnimatePresence>
                                                                {isEditing && (
                                                                    <motion.div 
                                                                        initial={{ opacity: 0, scale: 0.95, y: sIdx < 2 ? -10 : 10 }}
                                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                        exit={{ opacity: 0, scale: 0.95, y: sIdx < 2 ? -10 : 10 }}
                                                                        className={`absolute ${sIdx < 2 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 z-50 bg-white border border-border shadow-md rounded-2xl p-4 flex flex-col gap-3 min-w-[180px] animate-reveal`}
                                                                    >
                                                                        <div className="text-center pb-2 border-b border-border">
                                                                            <p className="text-[11px] font-semibold text-brand ">{label}</p>
                                                                            <p className="text-[11px] font-semibold text-muted mt-1">{sub.name}</p>
                                                                        </div>
                                                                        {marks.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 pb-2 border-b border-border">
                                                                                {marks.map(m => (
                                                                                    <button 
                                                                                        key={m.id}
                                                                                        onClick={() => handleRemoveMark(m.id)}
                                                                                        className="px-2 py-1 bg-red-50 text-red-600 rounded-xl text-[11px] font-semibold flex items-center gap-1 hover:bg-red-100"
                                                                                    >
                                                                                        {m.mark} <span className="text-[11px]">×</span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-wrap gap-1 justify-center">
                                                                            {['5+', '5', '5-', '4+', '4', '4-', '3+', '3', '3-', '2', '1'].map((v) => (
                                                                                <button 
                                                                                    key={v}
                                                                                    onClick={() => {
                                                                                        const originalSub = selectedSubject;
                                                                                        setSelectedSubject(sub.id);
                                                                                        handleAddMark(s.uid, v, type as any, 'summary').then(() => setSelectedSubject(originalSub));
                                                                                    }}
                                                                                    className={`w-8 h-8 border border-border/50 rounded-xl text-[11px] font-semibold transition-all hover:bg-brand/10 text-text ${v.includes('+') ? 'text-green-600 bg-green-50/30' : v.includes('-') ? 'text-orange-600 bg-orange-50/30' : ''}`}
                                                                                >
                                                                                    {v}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        <button 
                                                                            onClick={() => setEditingCell(null)}
                                                                            className="w-full mt-1 py-2 bg-slate-50 text-[11px] font-semibold text-muted rounded-xl hover:bg-slate-100"
                                                                        >
                                                                            Bağla
                                                                        </button>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                };

                                                return (
                                                    <td key={sub.id} className="p-4 border-r border-border border-b group-cell text-center">
                                                        <div className="text-[11px] font-semibold text-muted/60 mb-2">ORT: {subAvg || '-'}</div>
                                                        <div className="flex justify-center items-center gap-3">
                                                            {renderSummaryCell('half_year_1', h1m, 'I Yarımil')}
                                                            {renderSummaryCell('half_year_2', h2m, 'II Yarımil')}
                                                            <div className="w-px h-6 bg-border/40 mx-0.5" />
                                                            {renderSummaryCell('annual', annualm, 'İllik')}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className="p-6 border-b border-border text-center bg-brand/5">
                                                <span className="text-sm font-semibold text-brand tracking-tight shadow-sm">{globalGpa}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                    <p className="text-xs text-neutral-400">Jurnal məlumatları emal olunur...</p>
                </div>
            ) : viewMode === 'daily' ? (
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl  overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-brand/20 scrollbar-track-transparent">
                        <table className="w-full text-left border-collapse min-w-[1200px]">
                            <thead>
                                <tr className="bg-muted/5">
                                    <th className="sticky left-0 z-20 bg-surface/95 p-6 text-[11px] font-semibold text-brand border-b border-border">
                                        Şagird
                                    </th>
                                    {dates.map((date) => (
                                        <th key={date} className="p-4 text-[11px] font-semibold text-muted border-b border-border text-center min-w-[60px]">
                                            {date.split('-').slice(1).reverse().join('/')}
                                        </th>
                                    ))}
                                    <th className="p-6 text-[11px] font-semibold text-green-600 border-b border-border text-center bg-green-50/30">I Yar</th>
                                    <th className="p-6 text-[11px] font-semibold text-green-600 border-b border-border text-center bg-green-50/30">II Yar</th>
                                    <th className="p-6 text-[11px] font-semibold text-brand border-b border-border text-center bg-brand/5">İllik</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredStudents.map((s) => (
                                    <tr key={s.uid} className={`hover:bg-brand/[0.02] transition-colors ${s.uid === auth.currentUser?.uid ? 'bg-brand/[0.03]' : ''}`}>
                                        <td className="sticky left-0 z-10 bg-surface/95 p-6 border-r border-border/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-[11px] font-semibold text-brand shrink-0">
                                                    {s.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-text tracking-tight truncate">{s.name} {s.surname}</p>
                                                    <p className="text-[11px] font-semibold text-muted truncate">{s.uid === auth.currentUser?.uid ? 'MƏN' : 'Tələbə'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        
                                        {/* Daily Marks */}
                                        {dates.map((date) => {
                                            const cellMarks = getMarks(s.uid, 'daily', date);
                                            const isEditing = editingCell?.sid === s.uid && editingCell?.date === date && editingCell?.type === 'daily';
                                            
                                            return (
                                                <td key={date} className="p-2 text-center relative group min-w-[70px]">
                                                    {isTeacher ? (
                                                        <div className="relative">
                                                            <div className="flex flex-wrap items-center justify-center gap-0.5 min-h-[40px] p-1 border border-transparent hover:border-brand/20 rounded-xl cursor-pointer" 
                                                                 onClick={() => setEditingCell(isEditing ? null : {sid: s.uid, type: 'daily', date})}>
                                                                {cellMarks.map((m, idx) => (
                                                                    <React.Fragment key={m.id}>
                                                                        <span className={`w-6 h-6 rounded-xl flex items-center justify-center text-[11px] font-semibold shadow-sm border border-border/20 ${m.mark === '5' ? 'bg-green-50 text-green-600' : m.mark === '+' ? 'bg-brand-50 text-brand-600' : m.mark === '-' || m.mark === 'q' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-text'}`}>
                                                                            {m.mark}
                                                                        </span>
                                                                        {idx < cellMarks.length - 1 && <span className="text-[11px] text-slate-200">/</span>}
                                                                    </React.Fragment>
                                                                ))}
                                                                {cellMarks.length === 0 && <span className="text-slate-200">·</span>}
                                                            </div>
                                                            
                                                            <AnimatePresence>
                                                                {isEditing && (
                                                                    <motion.div 
                                                                        initial={{ opacity: 0, y: filteredStudents.indexOf(s) < 2 ? -10 : 10 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        exit={{ opacity: 0, y: filteredStudents.indexOf(s) < 2 ? -10 : 10 }}
                                                                        className={`absolute ${filteredStudents.indexOf(s) < 2 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 z-50 bg-surface border border-border shadow-md rounded-2xl p-3 flex flex-col gap-3 min-w-[200px] animate-reveal`}
                                                                    >
                                                                        <div className="text-center pb-2 border-b border-border">
                                                                            <p className="text-[11px] font-semibold text-brand ">Gündəlik Qiymət</p>
                                                                            <p className="text-[11px] font-semibold text-muted mt-0.5">{SUBJECTS.find(sub => sub.id === selectedSubject)?.name}</p>
                                                                        </div>
                                                                        {cellMarks.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 pb-2 border-b border-border">
                                                                                {cellMarks.map(m => (
                                                                                    <button 
                                                                                        key={m.id}
                                                                                        onClick={() => handleRemoveMark(m.id)}
                                                                                        className="px-2 py-1 bg-red-50 text-red-600 rounded-xl text-[11px] font-semibold flex items-center gap-1 hover:bg-red-100"
                                                                                    >
                                                                                        {m.mark} <span className="text-[11px]">×</span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-wrap gap-1 justify-center">
                                                                            {['+', '-', '5+', '5', '5-', '4+', '4', '4-', '3+', '3', '3-', '2-', '2', '1', 'q'].map((v) => (
                                                                                <button 
                                                                                    key={v}
                                                                                    onClick={() => handleAddMark(s.uid, v, 'daily', date)}
                                                                                    className={`w-9 h-9 border border-border/50 rounded-xl text-[11px] font-semibold transition-all hover:bg-brand/10 text-text ${v === 'q' ? 'text-red-500 bg-red-50/50' : v.includes('+') ? 'text-green-600 bg-green-50/30' : v.includes('-') ? 'text-orange-600 bg-orange-50/30' : ''}`}
                                                                                >
                                                                                    {v}
                                                                                </button>
                                                                            ))}
                                                                            <button 
                                                                                onClick={() => setEditingCell(null)}
                                                                                className="w-full mt-1 py-2 bg-slate-50 text-[11px] font-semibold text-muted rounded-xl"
                                                                            >
                                                                                Bağla
                                                                            </button>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    ) : (
                                                        <div 
                                                            className="flex flex-wrap items-center justify-center gap-1 cursor-pointer hover:bg-brand/5 rounded-xl p-1 transition-colors"
                                                            onClick={() => cellMarks.length > 0 && setSelectedMarkInfo({
                                                                subName: currentUser.language === 'ru' ? (SUBJECTS.find(sub => sub.id === selectedSubject)?.name_ru || '') : (SUBJECTS.find(sub => sub.id === selectedSubject)?.name || ''),
                                                                date: date,
                                                                mark: cellMarks.map(m => m.mark).join(', ')
                                                            })}
                                                        >
                                                            {cellMarks.map((m, idx) => (
                                                                <React.Fragment key={m.id}>
                                                                    <span className={`w-6 h-6 rounded-xl flex items-center justify-center text-[11px] font-semibold shadow-sm border border-border/20 ${m.mark === '5' ? 'bg-green-50 text-green-600' : m.mark === '+' ? 'bg-brand-50 text-brand-600' : m.mark === '-' || m.mark === 'q' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-text'}`}>
                                                                        {m.mark}
                                                                    </span>
                                                                    {idx < cellMarks.length - 1 && <span className="text-[11px] text-slate-200">/</span>}
                                                                </React.Fragment>
                                                            ))}
                                                            {cellMarks.length === 0 && <span className="text-slate-300 font-semibold text-xs">·</span>}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}

                                        {/* Summary Marks */}
                                        {['half_year_1', 'half_year_2', 'annual'].map((type) => {
                                            const cellMarks = getMarks(s.uid, type, 'summary');
                                            const isEditing = editingCell?.sid === s.uid && editingCell?.type === type;

                                            return (
                                                <td key={type} className={`p-4 text-center ${type === 'annual' ? 'bg-brand/[0.02]' : 'bg-green-50/20'}`}>
                                                    {isTeacher ? (
                                                        <div className="relative">
                                                            <div 
                                                                onClick={() => setEditingCell(isEditing ? null : {sid: s.uid, type, date: 'summary'})}
                                                                className={`w-12 h-12 rounded-2xl flex flex-wrap items-center justify-center gap-0.5 p-1 transition-all cursor-pointer ${cellMarks.length > 0 ? 'bg-brand text-white' : 'border-2 border-dashed border-border text-slate-300 hover:border-brand/40'}`}
                                                            >
                                                                {cellMarks.map((m, idx) => (
                                                                    <React.Fragment key={m.id}>
                                                                        <span className="text-xs font-semibold">{m.mark}</span>
                                                                        {idx < cellMarks.length - 1 && <span className="text-[11px] opacity-40">/</span>}
                                                                    </React.Fragment>
                                                                ))}
                                                                {cellMarks.length === 0 && <span className="text-sm font-semibold">?</span>}
                                                            </div>

                                                            <AnimatePresence>
                                                                {isEditing && (
                                                                    <motion.div 
                                                                        initial={{ opacity: 0, scale: 0.95, y: filteredStudents.indexOf(s) < 2 ? -10 : 10 }}
                                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                        exit={{ opacity: 0, scale: 0.95, y: filteredStudents.indexOf(s) < 2 ? -10 : 10 }}
                                                                        className={`absolute ${filteredStudents.indexOf(s) < 2 ? 'top-full mt-3' : 'bottom-full mb-3'} right-0 z-50 bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3 min-w-[200px]`}
                                                                    >
                                                                        <div className="text-center pb-2 border-b border-border">
                                                                            <p className="text-[11px] font-semibold text-brand ">Xülasə Qiymət</p>
                                                                            <div className="mt-2 bg-brand/5 p-2 rounded-xl border border-brand/10">
                                                                                <p className="text-[11px] font-semibold text-muted mb-1">Ortalama (Real)</p>
                                                                                <p className="text-xs font-semibold text-brand">{calculateAverage(s.uid, selectedSubject) || '-'}</p>
                                                                            </div>
                                                                        </div>
                                                                        {cellMarks.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 pb-2 border-b border-border">
                                                                                {cellMarks.map(m => (
                                                                                    <button 
                                                                                        key={m.id}
                                                                                        onClick={() => handleRemoveMark(m.id)}
                                                                                        className="px-2 py-1 bg-red-50 text-red-600 rounded-xl text-[11px] font-semibold flex items-center gap-1 hover:bg-red-100"
                                                                                    >
                                                                                        {m.mark} <span>×</span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-wrap gap-1 justify-center">
                                                                            {['5+', '5', '5-', '4+', '4', '4-', '3+', '3', '3-', '2', '1'].map((v) => (
                                                                                <button 
                                                                                    key={v}
                                                                                    onClick={() => handleAddMark(s.uid, v, type as any, 'summary')}
                                                                                    className={`w-10 h-10 border border-border/50 rounded-xl text-xs font-semibold transition-all hover:bg-brand/10 text-text ${v.includes('+') ? 'text-green-600 bg-green-50/30' : v.includes('-') ? 'text-orange-600 bg-orange-50/30' : ''}`}
                                                                                >
                                                                                    {v}
                                                                                </button>
                                                                            ))}
                                                                            <button 
                                                                                onClick={() => setEditingCell(null)}
                                                                                className="w-full mt-1 py-2 bg-slate-50 text-[11px] font-semibold text-muted rounded-xl"
                                                                            >
                                                                                Bağla
                                                                            </button>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                                            {cellMarks.map((m, idx) => (
                                                                <React.Fragment key={m.id}>
                                                                    <span className={`text-base font-semibold ${m.mark === '5' ? 'text-green-500' : 'text-text'}`}>
                                                                        {m.mark}
                                                                    </span>
                                                                    {idx < cellMarks.length - 1 && <span className="text-xs text-slate-300">/</span>}
                                                                </React.Fragment>
                                                            ))}
                                                            {cellMarks.length === 0 && <span className="text-slate-300 font-semibold">-</span>}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}
        </div>
    );
};
