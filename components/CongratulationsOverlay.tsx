
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, MailOpen, X } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { User, Congratulation } from '../types';

interface CongratulationsOverlayProps {
    user: User;
}

export const CongratulationsOverlay: React.FC<CongratulationsOverlayProps> = ({ user }) => {
    const [congrats, setCongrats] = useState<Congratulation[]>([]);
    const [current, setCurrent] = useState<Congratulation | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (user.role !== 'student') return;

        const q = query(
            collection(db, 'congratulations'),
            where('studentId', 'in', [user.username || user.id, 'all'])
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const allCongrats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Congratulation));
            const unseen = allCongrats.filter(c => {
                if (c.studentId === 'all') {
                    return !c.seenBy?.includes(user.username || user.id);
                }
                return !c.seen;
            });
            
            setCongrats(unseen);
            if (unseen.length > 0 && !current) {
                setCurrent(unseen[0]);
            }
        }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'congratulations');
        });

        return () => unsub();
    }, [user.id, user.role, current]);

    const handleOpen = () => {
        setIsOpen(true);
    };

    const handleClose = async () => {
        if (current) {
            const ref = doc(db, 'congratulations', current.id);
            if (current.studentId === 'all') {
                await updateDoc(ref, {
                    seenBy: arrayUnion(user.username || user.id)
                });
            } else {
                await updateDoc(ref, { seen: true });
            }
        }
        setIsOpen(false);
        setCurrent(null);
    };

    if (!current) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.96, opacity: 0, y: 12 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0, y: 12 }}
                    className="relative w-full max-w-lg"
                >
                    {!isOpen ? (
                        <div
                            onClick={handleOpen}
                            className="bg-white dark:bg-neutral-900 rounded-2xl p-10 shadow-md cursor-pointer border border-border flex flex-col items-center text-center space-y-6"
                        >
                            <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                                <Mail size={26} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-text">Yeni təbrikiniz var</h2>
                                <p className="text-muted text-xs mt-2">Müəlliminiz sizə təbrik göndərib</p>
                            </div>
                            <div className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-xs transition-colors">
                                Aç
                            </div>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-white dark:bg-neutral-900 rounded-2xl p-8 sm:p-10 shadow-md border border-border relative overflow-hidden min-h-[360px] flex flex-col"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600" />
                            <button onClick={handleClose} className="absolute top-5 right-5 p-2 text-muted hover:text-text transition-colors z-10">
                                <X size={20} />
                            </button>

                            <div className="flex-1 space-y-6 relative z-10">
                                <header className="space-y-2">
                                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                        <MailOpen size={16} />
                                        <span className="text-xs font-medium">Təbriknamə</span>
                                    </div>
                                    <h2 className="text-2xl font-semibold tracking-tight text-text leading-tight">{current.title}</h2>
                                </header>

                                <p className="text-sm text-text/80 leading-relaxed whitespace-pre-wrap">
                                    {current.message}
                                </p>

                                <footer className="pt-6 border-t border-border">
                                    <p className="text-[11px] text-muted">Hörmətlə,</p>
                                    <p className="text-sm font-medium text-text">{current.teacherName}</p>
                                </footer>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
