
import React, { useState } from 'react';
import { User } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { Loader2, User as UserIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface UsernameSetupProps {
  user: User;
}

export const UsernameSetup: React.FC<UsernameSetupProps> = ({ user }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setError('İstifadəçi adı ən azı 3 simvol olmalıdır.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check if username is taken using the dedicated collection
      const usernameRef = doc(db, 'usernames', cleanUsername);
      const usernameSnap = await getDocs(query(collection(db, 'usernames'), where('username', '==', cleanUsername)));
      
      // Better: try to create the document in 'usernames' first
      // If it exists, it will fail or we can check
      // But since we don't have a 'create if not exists' atomic op easily here without a transaction, 
      // we'll use the doc ID check.
      
      const checkDoc = await getDocs(query(collection(db, 'usernames'), where('__name__', '==', cleanUsername)));

      if (!checkDoc.empty) {
        setError('Bu istifadəçi adı artıq götürülüb.');
        setLoading(false);
        return;
      }

      // Use a transaction or sequential writes
      // 1. Create username mapping
      await setDoc(doc(db, 'usernames', cleanUsername), {
        uid: user.uid,
        username: cleanUsername
      });

      // 2. Update user document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { username: cleanUsername });
      
      // The onSnapshot in App.tsx will pick up the change
    } catch (err: any) {
      setError(err.message || 'Xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface border border-border p-10 rounded-2xl shadow-md space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center text-brand mx-auto">
            <UserIcon className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold text-text tracking-tight ">Profilini Tamamla</h2>
          <p className="text-muted text-[11px] font-semibold ">Davam etmək üçün özünə bir istifadəçi adı seç.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-muted ml-1">İstifadəçi adı</label>
            <div className="relative">
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                className="w-full px-6 py-4 bg-background border border-border rounded-2xl focus:border-brand outline-none text-sm font-semibold transition-all text-text placeholder:text-muted/50"
                placeholder="ali_123"
                required
                disabled={loading}
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-[11px] font-semibold ml-1 mt-2">
                <AlertCircle className="w-3 h-3" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-brand text-white py-5 rounded-2xl font-semibold text-[11px] shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Təsdiqlə'}
          </button>
        </form>

        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
          <p className="text-[11px] font-semibold text-indigo-600 leading-relaxed text-center">
            İstifadəçi adı sistemdə səni tanımaq üçün istifadə olunacaq.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
