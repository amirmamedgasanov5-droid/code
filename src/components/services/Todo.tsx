
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckSquare, Square, Loader2, ListTodo, Bookmark } from 'lucide-react';
import { db } from '../../../firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../utils/firestoreError';
import { User } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';

interface TodoProps {
  user: User;
  onClose: () => void;
}

interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  category: string;
  createdAt: any;
}

export const Todo: React.FC<TodoProps> = ({ user, onClose }) => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'todos'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as TodoItem)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'todos');
    });

    return () => unsub();
  }, [user.uid]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    setAdding(true);
    try {
      await addDoc(collection(db, 'todos'), {
        userId: user.uid,
        title: newTodo.trim(),
        completed: false,
        category: 'general',
        createdAt: serverTimestamp()
      });
      setNewTodo('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'todos');
    } finally {
      setAdding(false);
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, 'todos', id), {
        completed: !completed
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'todos');
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'todos', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'todos');
    }
  };

  const completedCount = todos.filter(t => t.completed).length;
  const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl h-[80vh] rounded-2xl shadow-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border bg-slate-50">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-text text-xs">Məqsədlər</h3>
              <p className="text-muted text-[11px] font-semibold mt-1">Gündəlik tapşırıqlar</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted">
              <span>Tərəqqi</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-brand"
              />
            </div>
          </div>
        </div>

        {/* Input */}
        <form onSubmit={addTodo} className="p-6 border-b border-border">
          <div className="relative">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Yeni tapşırıq əlavə edin..."
              className="w-full bg-slate-100 border-none rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-brand/20 placeholder:text-slate-400"
            />
            <button 
              type="submit"
              disabled={adding || !newTodo.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand text-white rounded-xl transition-all disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
          ) : todos.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {todos.map(todo => (
                <motion.div
                  key={todo.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all group ${todo.completed ? 'bg-slate-50 border-transparent opacity-60' : 'bg-white border-border hover:border-brand/20 shadow-sm'}`}
                >
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={() => toggleTodo(todo.id, todo.completed)}
                      className={`transition-colors ${todo.completed ? 'text-brand' : 'text-slate-300 hover:text-brand'}`}
                    >
                      {todo.completed ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                    <span className={`text-sm font-medium transition-all ${todo.completed ? 'line-through text-muted' : 'text-text'}`}>
                      {todo.title}
                    </span>
                  </div>
                  <button 
                    onClick={() => deleteTodo(todo.id)}
                    className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                <ListTodo className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-muted text-[11px] font-semibold ">Hələ ki, heç bir tapşırıq yoxdur</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
