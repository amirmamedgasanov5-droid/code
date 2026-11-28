
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, FileText, Loader2 } from 'lucide-react';
import { db } from '../../../firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../utils/firestoreError';
import { User } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';

interface NotesProps {
  user: User;
  onClose: () => void;
}

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: any;
  updatedAt: any;
}

export const Notes: React.FC<NotesProps> = ({ user, onClose }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'notes'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Note)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
    });

    return () => unsub();
  }, [user.uid]);

  const createNote = async () => {
    try {
      const docRef = await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        title: 'Yeni Qeyd',
        content: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setActiveNote({ id: docRef.id, title: 'Yeni Qeyd', content: '', createdAt: null, updatedAt: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    }
  };

  const updateNote = async (id: string, title: string, content: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'notes', id), {
        title,
        content,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'notes');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
      if (activeNote?.id === id) setActiveNote(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'notes');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-md flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-slate-50 flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-text text-[11px]">Qeydlər</h3>
            <button onClick={createNote} className="p-1.5 bg-brand text-white rounded-xl hover:scale-105 transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-brand" />
              </div>
            ) : notes.map(note => (
              <button
                key={note.id}
                onClick={() => setActiveNote(note)}
                className={`w-full text-left p-3 rounded-xl transition-all group ${activeNote?.id === note.id ? 'bg-white shadow-sm border border-border' : 'hover:bg-slate-100'}`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-text text-xs truncate flex-1">{note.title || 'Başlıqsız'}</h4>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                    className="p-1 text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-muted text-[11px] truncate mt-1">{note.content || 'Mətn yoxdur...'}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin text-brand" />}
              <span className="text-[11px] font-semibold text-muted ">
                {saving ? 'Yadda saxlanılır...' : 'Bütün dəyişikliklər yadda saxlanıldı'}
              </span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeNote ? (
            <div className="flex-1 flex flex-col p-8 space-y-4">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setActiveNote({ ...activeNote, title: newTitle });
                  updateNote(activeNote.id, newTitle, activeNote.content);
                }}
                placeholder="Başlıq..."
                className="text-2xl font-semibold text-text border-none focus:ring-0 p-0 placeholder:text-slate-300"
              />
              <textarea
                value={activeNote.content}
                onChange={(e) => {
                  const newContent = e.target.value;
                  setActiveNote({ ...activeNote, content: newContent });
                  updateNote(activeNote.id, activeNote.title, newContent);
                }}
                placeholder="Qeydlərinizi bura yazın..."
                className="flex-1 text-text border-none focus:ring-0 p-0 resize-none placeholder:text-slate-300 leading-relaxed"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                <FileText className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-muted text-[11px] font-semibold ">Qeyd seçin və ya yenisini yaradın</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
