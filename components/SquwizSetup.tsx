
import React, { useState, useEffect } from 'react';
import { User, Role } from '../types';
import { User as UserIcon, Check, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db } from '../firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface SquwizSetupProps {
    onComplete: (userData: User) => void;
}

export const SquwizSetup: React.FC<SquwizSetupProps> = ({ onComplete }) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<Role>('student');
    const [className, setClassName] = useState('1-A');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Pre-sign in anonymously to get a UID
        if (!auth.currentUser) {
            signInAnonymously(auth).catch(err => console.error("SQUWIZ Setup Auth failed:", err));
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim() || !email.trim() || loading) return;

        setLoading(true);
        try {
            // Ensure we have a Firebase UID
            let currentUser = auth.currentUser;
            if (!currentUser) {
                currentUser = (await signInAnonymously(auth)).user;
            }

            const uid = currentUser.uid;
            // Generate a 4-digit ID
            const fourDigitId = Math.floor(1000 + Math.random() * 9000).toString();
            
            const userData: User = {
                id: fourDigitId, 
                uid: uid,
                name: `${firstName.trim()} ${lastName.trim()}`,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                role: 'student',
                ...(role === 'teacher' ? { requestedRole: 'teacher' as const } : {}),
                className,
                theme: 'light',
                language: 'az',
                effectsEnabled: true,
                animationsEnabled: true,
                glassmorphism: true,
                showNotifications: true,
                createdAt: new Date().toISOString()
            };

            // Save to Firestore so the user is "real" and can be found by others
            await setDoc(doc(db, 'users', uid), {
                ...userData,
                createdAt: serverTimestamp()
            });

            onComplete(userData);
        } catch (error: any) {
            console.error("SQUWIZ Setup failed details:", error);
            // Show more specific error if possible
            const errorMessage = error?.message || "Naməlum xəta";
            alert(`Xəta baş verdi: ${errorMessage}\n\nZəhmət olmasa Firebase konsolunda 'Anonymous Auth' aktiv olduğunu yoxlayın.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[5000] bg-background flex items-center justify-center p-6 overflow-y-auto">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 md:p-12 shadow-md space-y-8"
            >
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto border border-brand/20">
                        <UserIcon className="w-10 h-10 text-brand" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-text tracking-tight ">Profilini Tamamla</h2>
                        <p className="text-[11px] font-semibold text-muted mt-2">SQUWIZ ID ilə uğurla giriş etdiniz</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-semibold text-muted mb-2.5 ml-1">Adınız</label>
                            <input 
                                type="text" 
                                value={firstName} 
                                onChange={e => setFirstName(e.target.value)} 
                                className="w-full px-6 py-4 bg-background border border-border rounded-2xl focus:border-brand outline-none text-xs font-semibold transition-all text-text placeholder:text-muted/50" 
                                placeholder="Məsələn: Əli" 
                                required 
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-muted mb-2.5 ml-1">Soyadınız</label>
                            <input 
                                type="text" 
                                value={lastName} 
                                onChange={e => setLastName(e.target.value)} 
                                className="w-full px-6 py-4 bg-background border border-border rounded-2xl focus:border-brand outline-none text-xs font-semibold transition-all text-text placeholder:text-muted/50" 
                                placeholder="Məsələn: Əliyev" 
                                required 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-muted mb-2.5 ml-1">E-poçt Ünvanınız</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={e => setEmail(e.target.value)} 
                            className="w-full px-6 py-4 bg-background border border-border rounded-2xl focus:border-brand outline-none text-xs font-semibold transition-all text-text placeholder:text-muted/50" 
                            placeholder="Məsələn: ali@example.com" 
                            required 
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-[11px] font-semibold text-muted mb-1 ml-1">Rolunuz</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                type="button" 
                                onClick={() => setRole('student')} 
                                className={`py-4 text-[11px] font-semibold rounded-2xl border transition-all ${role === 'student' ? 'bg-brand text-white border-brand' : 'border-border text-muted hover:border-brand/20'}`}
                            >
                                TƏLƏBƏ
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setRole('teacher')} 
                                className={`py-4 text-[11px] font-semibold rounded-2xl border transition-all ${role === 'teacher' ? 'bg-brand text-white border-brand' : 'border-border text-muted hover:border-brand/20'}`}
                            >
                                MÜƏLLİM
                            </button>
                        </div>
                    </div>

                    {role === 'student' && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                            <label className="block text-[11px] font-semibold text-muted mb-2.5 ml-1">Sinfiz</label>
                            <select 
                                value={className} 
                                onChange={e => setClassName(e.target.value)}
                                className="w-full px-6 py-4 bg-background border border-border rounded-2xl focus:border-brand outline-none text-xs font-semibold transition-all text-text appearance-none"
                            >
                                <option value="1-A">1-A</option>
                                <option value="1-B">1-B</option>
                                <option value="2-A">2-A</option>
                                <option value="2-B">2-B</option>
                            </select>
                        </motion.div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading || !firstName.trim() || !lastName.trim() || !email.trim()} 
                        className="w-full bg-brand text-white py-5 rounded-2xl font-semibold text-[11px] hover:opacity-95 transition-all flex items-center justify-center gap-3"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                            <>
                                <Check className="w-5 h-5" />
                                TƏSDİQLƏ VƏ BAŞLA
                            </>
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};
