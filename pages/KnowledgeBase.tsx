
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { Search, Plus, Trash2, ExternalLink, BookOpen, Loader2, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toast, ToastType } from '../components/Toast';
import { translations } from '../i18n';

interface KnowledgeResource {
    id: string;
    title: string;
    url: string;
    authorId: string;
    authorName: string;
    createdAt: any;
}

interface KnowledgeBaseProps {
    user: User;
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ user }) => {
    const t = translations[user.language || 'az'];
    const [resources, setResources] = useState<KnowledgeResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });
    const [formData, setFormData] = useState({ title: '', url: '' });

    useEffect(() => {
        const q = query(collection(db, 'knowledge_base'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KnowledgeResource));
            setResources(data);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'knowledge_base');
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAddResource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.url.trim()) return;

        setIsSaving(true);
        try {
            await addDoc(collection(db, 'knowledge_base'), {
                title: formData.title,
                url: formData.url,
                authorId: auth.currentUser?.uid,
                authorName: user.name,
                createdAt: serverTimestamp()
            });
            setFormData({ title: '', url: '' });
            setShowForm(false);
            setToast({ visible: true, message: "Resurs uğurla əlavə edildi!", type: 'success' });
        } catch (error: any) {
            setToast({ visible: true, message: "Xəta baş verdi: " + error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Bu resursu silmək istəyirsiniz?")) return;
        try {
            await deleteDoc(doc(db, 'knowledge_base', id));
            setToast({ visible: true, message: "Resurs silindi", type: 'success' });
        } catch (error: any) {
            setToast({ visible: true, message: "Silmək mümkün olmadı", type: 'error' });
        }
    };

    const filteredResources = resources.filter(r => 
        r.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isAuthorized = user.role === 'teacher' || user.role === 'admin';

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            <Toast 
                isVisible={toast.visible} 
                message={toast.message} 
                type={toast.type} 
                onClose={() => setToast({ ...toast, visible: false })} 
            />

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border pb-5">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl">
                        <BookOpen className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-text">{t.knowledge_base}</h1>
                        <p className="text-xs text-muted mt-0.5">Faydalı kitablar və resurslar</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input 
                            type="text" 
                            placeholder="Resurs axtar..." 
                            className="w-full bg-surface border border-border rounded-xl py-3 pl-10 pr-4 text-xs font-semibold text-text focus:ring-1 focus:ring-brand outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {isAuthorized && (
                        <button 
                            onClick={() => setShowForm(true)}
                            className="bg-brand text-white p-3 rounded-xl hover:opacity-90 transition-all"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </header>

            <AnimatePresence>
                {showForm && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-8 bg-surface border border-border rounded-2xl shadow-md space-y-6"
                    >
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-text tracking-tight">Yeni Resurs Əlavə Et</h2>
                            <button onClick={() => setShowForm(false)} className="p-2 hover:bg-background rounded-xl">
                                <X className="w-4 h-4 text-muted" />
                            </button>
                        </div>

                        <form onSubmit={handleAddResource} className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-muted ml-1">Kitabın/Resursun Adı</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="Məs: Fiqh dərsləri PDF"
                                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-text focus:ring-1 focus:ring-brand outline-none"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-muted ml-1">Link (Google Docs/Drivesdk)</label>
                                <input 
                                    required
                                    type="url" 
                                    placeholder="https://docs.google.com/..."
                                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-text focus:ring-1 focus:ring-brand outline-none"
                                    value={formData.url}
                                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={isSaving}
                                className="md:col-span-2 bg-brand text-white py-4 rounded-xl font-semibold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Əlavə et
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-brand" />
                    <p className="text-[11px] font-semibold text-muted ">Resurslar yüklənir...</p>
                </div>
            ) : filteredResources.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredResources.map((resource) => (
                        <motion.div 
                            key={resource.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="group p-6 bg-surface border border-border rounded-2xl hover:border-brand/40 transition-all shadow-sm flex flex-col justify-between"
                        >
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="p-3 bg-brand/5 rounded-2xl">
                                        <ExternalLink className="w-5 h-5 text-brand" />
                                    </div>
                                    <div className="text-[11px] font-semibold text-muted ">
                                        {resource.authorName}
                                    </div>
                                </div>
                                <h3 className="text-lg font-semibold text-text leading-tight group-hover:text-brand transition-colors tracking-tight line-clamp-2">
                                    {resource.title}
                                </h3>
                            </div>

                            <div className="mt-8 flex items-center gap-3">
                                <a 
                                    href={resource.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex-1 bg-background border border-border hover:border-brand p-4 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-semibold text-muted hover:text-brand transition-all"
                                >
                                    Resursu aç
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                                {isAuthorized && (
                                    <button 
                                        onClick={() => handleDelete(resource.id)}
                                        className="p-4 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="py-20 text-center space-y-6 bg-surface rounded-2xl border border-dashed border-border flex flex-col items-center">
                    <AlertCircle className="w-16 h-16 text-muted/20" />
                    <div className="space-y-2">
                        <p className="text-text font-semibold text-lg tracking-tight">Hələ ki heç bir resurs yoxdur</p>
                        <p className="text-muted text-xs font-medium">Yeni resurslar əlavə edildikdə burada görünəcək.</p>
                    </div>
                </div>
            )}
        </div>
    );
};
