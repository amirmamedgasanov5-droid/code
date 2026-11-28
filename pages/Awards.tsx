import React, { useState, useEffect } from 'react';
import { AwardItem, User } from '../types';
import { Award as AwardIcon, Trophy, Medal, Star, Plus, Loader2, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { DiplomaGeneratorModal } from '../components/DiplomaGeneratorModal';
import { DiplomaCard, DiplomaData } from '../components/DiplomaCard';
import { Toast, ToastType } from '../components/Toast';

interface AwardsProps {
    user: User;
}

export const Awards: React.FC<AwardsProps> = ({ user }) => {
    const isAuthorized = user.role === 'teacher' || user.role === 'admin';
    const [activeTab, setActiveTab] = useState<'diplomas' | 'certificates' | 'achievements'>('diplomas');
    const [awards, setAwards] = useState<AwardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showGeneratorModal, setShowGeneratorModal] = useState(false);
    const [students, setStudents] = useState<{ uid: string; name: string }[]>([]);
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });

    useEffect(() => {
        let awardsQuery = query(collection(db, 'awards'), orderBy('createdAt', 'desc'));
        if (user.role === 'student') {
            awardsQuery = query(
                collection(db, 'awards'),
                where('studentId', 'in', [user.uid, user.id || '']),
                orderBy('createdAt', 'desc')
            );
        }

        const unsub = onSnapshot(awardsQuery, (snap) => {
            setAwards(snap.docs.map(d => ({ id: d.id, ...d.data() } as AwardItem)));
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'awards');
            setLoading(false);
        });

        if (isAuthorized) {
            getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
                .then(snap => {
                    setStudents(snap.docs.map(d => ({ uid: d.id, name: d.data().name || 'Tələbə' })));
                })
                .catch(err => console.error(err));
        }

        return () => unsub();
    }, [user.uid, user.id, user.role, isAuthorized]);

    const myCerts = awards.filter(a => {
        if (activeTab === 'diplomas') return a.type === 'diploma';
        if (activeTab === 'certificates') return a.type === 'certificate';
        return true;
    });

    const myAchievements = awards.filter(a => a.type === 'achievement');

    const convertToDiplomaData = (item: AwardItem): DiplomaData => {
        return {
            id: item.id,
            studentName: item.studentName || 'Mədrəsə Tələbəsi',
            type: item.diplomaType || (item.type === 'diploma' ? 'diploma' : 'certificate'),
            title: item.title || (item.type === 'diploma' ? 'Fəxri Mədrəsə Diplomu' : 'Rəsmi Nailiyyət Sertifikatı'),
            reason: item.reason || 'Mədrəsədə göstərdiyi yüksək nizam-intizam və əla qiymətlərə görə təltif edilir.',
            teacherName: item.teacherName || 'Mədrəsə Rəhbərliyi',
            date: item.date || (item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('az-AZ') : '2026-cı il'),
            serialNumber: item.serialNumber || `NM-2026-${item.id.slice(0, 4).toUpperCase()}`,
            imageUrl: item.imageUrl
        };
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            <Toast 
                isVisible={toast.visible} 
                message={toast.message} 
                type={toast.type} 
                onClose={() => setToast({ ...toast, visible: false })} 
            />

            {/* Header matching the minimal SaaS layout */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/70 dark:border-neutral-800/80">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-text">
                        Diplomlar & Sertifikatlar
                    </h1>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Rəsmi mədrəsə şəhadətnamələri, diplomlar və nailiyyətlər reyestri
                    </p>
                </div>

                {/* Minimal Segmented Tabs */}
                <div className="flex bg-neutral-100 dark:bg-neutral-900/90 p-1 rounded-xl border border-neutral-200/60 dark:border-neutral-800/80">
                    <button 
                        onClick={() => setActiveTab('diplomas')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            activeTab === 'diplomas' 
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ' 
                                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                        }`}
                    >
                        Diplomlar
                    </button>
                    <button 
                        onClick={() => setActiveTab('certificates')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            activeTab === 'certificates' 
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ' 
                                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                        }`}
                    >
                        Sertifikatlar
                    </button>
                    <button 
                        onClick={() => setActiveTab('achievements')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            activeTab === 'achievements' 
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ' 
                                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                        }`}
                    >
                        Nailiyyətlər
                    </button>
                </div>
            </div>

            {/* Teacher / Admin Action Strip */}
            {isAuthorized && (
                <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl  flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                                Rəsmi diplom & Qramota Generatoru
                            </h3>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                Tələbə seçərək 1 kliklə qramota tərtib edin və Valideyn Portalına göndərin
                            </p>
                        </div>
                    </div>

                    <button 
                        type="button"
                        onClick={() => setShowGeneratorModal(true)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-colors  flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Yeni Diplom Tərtib Et</span>
                    </button>
                </div>
            )}

            {/* Modal Generator */}
            <DiplomaGeneratorModal 
                isOpen={showGeneratorModal}
                onClose={() => setShowGeneratorModal(false)}
                students={students}
                teacherName={user.name}
                onSuccess={() => setToast({ visible: true, message: 'Diplom uğurla tərtib edildi və Valideyn Portalına göndərildi!', type: 'success' })}
            />

            {/* Animated Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                            <p className="text-xs text-neutral-400">Sənədlər yüklənir...</p>
                        </div>
                    ) : activeTab === 'achievements' ? (
                        /* Achievements Grid */
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {myAchievements.length > 0 ? myAchievements.map((ach) => (
                                <div 
                                    key={ach.id}
                                    className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl  space-y-2.5"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center">
                                            <Medal className="w-4 h-4" />
                                        </div>
                                        <span className="text-[11px] tabular-nums text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">
                                            Qazanıldı
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                                            {ach.name}
                                        </h3>
                                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                                            {ach.description}
                                        </p>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full py-16 text-center space-y-2 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-6">
                                    <Medal className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mx-auto" />
                                    <h4 className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                        Hələ ki heç bir nailiyyət qeydə alınmayıb
                                    </h4>
                                    <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                                        Dərslərdə fəal iştirak etdikcə burada xüsusi nailiyyət nişanları əks olunacaq.
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Diplomas & Certificates Grid */
                        <div className="space-y-6">
                            {myCerts.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                    {myCerts.map((cert) => {
                                        const diplomaData = convertToDiplomaData(cert);
                                        return (
                                            <div 
                                                key={cert.id}
                                                className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800  space-y-3"
                                            >
                                                <DiplomaCard data={diplomaData} />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="py-16 text-center space-y-3 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-6">
                                    <FileText className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mx-auto" />
                                    <h4 className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                        Hələlik heç bir {activeTab === 'diplomas' ? 'diplom' : 'sertifikat'} verilməyib
                                    </h4>
                                    <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                                        {isAuthorized 
                                            ? 'Yuxarıdakı "Yeni Diplom Tərtib Et" düyməsindən istifadə edərək tələbələrə rəsmi diplom göndərə bilərsiniz.' 
                                            : 'Müəllimlər uğurlarınıza görə fəxri diplom və sertifikatlar verdikdə burada əks olunacaq.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
