
import React, { useState, useEffect, useMemo } from 'react';
import { User, Book, Language } from '../types';
import { booksDb, auth } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { Plus, X, Loader2, BookOpen, Trash2, Search, ArrowLeft, AlertCircle, Globe, Bookmark, Maximize2, Minimize2, Image as ImageIcon } from 'lucide-react';
import { translations } from '../i18n';
import { Toast, ToastType } from '../components/Toast';
import { uploadImageToImgBB } from '../src/utils/imgbb';
import { motion, AnimatePresence } from 'motion/react';

interface LibraryProps {
  user: User;
}

export const Library: React.FC<LibraryProps> = ({ user }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLang, setFilterLang] = useState<Language | 'all'>('all');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });
  const [newBook, setNewBook] = useState({ 
    title: '', 
    content: '', 
    category: 'Ümumi',
    language: (user.language || 'az') as Language,
    readingEffect: 'none' as any,
    coverUrl: ''
  });
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const t = translations[user.language || 'az'];

  useEffect(() => {
    setLoading(true);
    const q = query(collection(booksDb, 'books'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
      setBooks(data);
      setLoading(false);
    }, (error) => {
      console.warn("Library books fetch error (check permissions on secondary database):", error.message);
      setBooks([]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBook.title.trim() || !newBook.content.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Sistemə daxil olmalısınız.");
      if (user.role !== 'teacher') throw new Error("Yalnız müəllimlər kitab əlavə edə bilər.");

      let coverUrl = '';
      if (coverImage) {
        coverUrl = await uploadImageToImgBB(coverImage);
      }

      const bookData = {
        title: newBook.title.trim(),
        content: newBook.content.trim(),
        category: newBook.category.trim() || 'Ümumi',
        language: newBook.language,
        readingEffect: newBook.readingEffect || 'none',
        coverUrl: coverUrl || '',
        authorId: currentUser.uid, 
        authorName: user.name,
        createdAt: new Date().toISOString() 
      };

      await addDoc(collection(booksDb, 'books'), bookData);
      setShowEditor(false);
      setNewBook({ title: '', content: '', category: 'Ümumi', language: (user.language || 'az') as Language, readingEffect: 'none' as any, coverUrl: '' });
      setCoverImage(null);
      setToast({ visible: true, message: "Kitab uğurla əlavə edildi!", type: 'success' });
    } catch (error: any) {
      setToast({ visible: true, message: `Ошибка: ${error.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Bu kitabı silmək istədiyinizə əminsiniz?")) {
      try {
        await deleteDoc(doc(booksDb, 'books', id));
        setToast({ visible: true, message: "Kitab silindi.", type: 'success' });
      } catch (err: any) {
        setToast({ visible: true, message: `Ошибка удаления: ${err.message}`, type: 'error' });
      }
    }
  };

  const filteredBooks = useMemo(() => {
    return books.filter(b => {
        const matchesSearch = b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             b.category.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLang = filterLang === 'all' || b.language === filterLang;
        return matchesSearch && matchesLang;
    });
  }, [books, searchTerm, filterLang]);

  const langList: {id: Language | 'all', label: string}[] = [
    { id: 'all', label: 'Bütün' },
    { id: 'az', label: 'Azerbaijani' },
    { id: 'ru', label: 'Русский' },
    { id: 'ar', label: 'Арабский' },
    { id: 'tr', label: 'Турецкий' },
    { id: 'en', label: 'Английский' }
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-6">
          <Loader2 className="w-12 h-12 animate-spin text-brand" />
          <p className="text-[11px] font-semibold text-muted ">Məlumatlar yüklənir...</p>
      </div>
    );
  }

  if (selectedBook) {
    return (
      <div className={`fixed inset-0 z-[500] overflow-y-auto transition-colors duration-700 ${focusMode ? 'bg-[#f4f1ea] #1a1a1a]' : 'bg-white '}`}>
        <div className="max-w-4xl mx-auto animate-fade-in pb-20 px-4 pt-12 relative z-10">
          <div className="flex justify-between items-center mb-12">
            <button onClick={() => { setSelectedBook(null); setFocusMode(false); }} className="flex items-center text-slate-500 hover:text-slate-900 :text-white transition-colors font-semibold text-sm group">
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Geri qayıt
            </button>
            <button 
              onClick={() => setFocusMode(!focusMode)}
              className={`p-3 rounded-2xl transition-all ${focusMode ? 'bg-slate-900 text-white  ' : 'bg-slate-100  text-slate-500'}`}
            >
              {focusMode ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>

          <article className={`space-y-12 transition-all duration-700 ${focusMode ? 'scale-105' : ''}`}>
              <header className="text-center space-y-6">
                  <div className="flex items-center justify-center gap-3">
                      <span className="px-4 py-1.5 bg-slate-900/5  text-slate-500 rounded-full text-[11px] font-semibold ">{selectedBook.category}</span>
                      <span className="px-4 py-1.5 bg-slate-900 text-white   rounded-full text-[11px] font-semibold ">{selectedBook.language}</span>
                      {selectedBook.readingEffect && selectedBook.readingEffect !== 'none' && (
                        <span className="px-4 py-1.5 bg-brand-500/10 text-brand-500 rounded-full text-[11px] font-semibold flex items-center gap-2">
                          <Bookmark className="w-3 h-3" /> {selectedBook.readingEffect}
                        </span>
                      )}
                  </div>
                  <h1 className={`font-semibold leading-tight tracking-tight transition-all duration-700 ${focusMode ? 'text-5xl text-[#433422] #e6dfd1]' : 'text-4xl text-slate-900 '}`}>
                    {selectedBook.title}
                  </h1>
                  <div className="flex items-center justify-center gap-2 text-slate-400 font-semibold text-xs ">
                    <span>{selectedBook.authorName}</span>
                  </div>
              </header>
              
              <div className={`
                transition-all duration-700 p-8 sm:p-16 rounded-2xl shadow-md leading-[2] text-lg whitespace-pre-wrap
                ${focusMode 
                  ? 'bg-[#fffefc] #252525] text-[#433422] #e6dfd1] border-none' 
                  : 'bg-white  text-slate-800  font-sans border border-slate-200 '}
              `}>
                  {selectedBook.content}
              </div>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({...toast, visible: false})} />
      
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 border-b border-border pb-5">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 w-full xl:w-auto">
            <div className="p-2.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl shrink-0">
                <BookOpen className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold tracking-tight text-text">{t.library}</h1>
                <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar max-w-full">
                    {langList.map(l => (
                        <button 
                            key={l.id}
                            onClick={() => setFilterLang(l.id)}
                            className={`text-[11px] font-semibold px-4 py-2 rounded-full border transition-all whitespace-nowrap ${filterLang === l.id ? 'bg-brand text-white border-brand' : 'text-muted border-border hover:border-text/30'}`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
            <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input type="text" placeholder="Axtar..." className="w-full bg-surface border border-border rounded-xl py-2.5 pl-10 pr-4 text-[11px] font-semibold text-text focus:ring-1 focus:ring-brand outline-none transition-all shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {user.role === 'teacher' && (
                <button onClick={() => setShowEditor(true)} className="w-full sm:w-auto bg-brand text-white px-5 py-2.5 rounded-xl font-semibold text-[11px] hover:opacity-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap">
                    <Plus className="w-3.5 h-3.5" /> {t.add || "Əlavə et"}
                </button>
            )}
        </div>
      </header>

      {showEditor && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-900/40 animate-fade-in">
              <div className="bg-surface w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-md overflow-hidden flex flex-col border border-border">
                  <div className="p-8 border-b border-border flex justify-between items-center bg-surface">
                      <div>
                        <h2 className="text-xl font-semibold text-text tracking-tight">Yeni Kitab Yaz</h2>
                      </div>
                      <button onClick={() => setShowEditor(false)} className="p-3 hover:bg-background rounded-xl transition-colors"><X className="w-5 h-5 text-muted" /></button>
                  </div>
                  <form onSubmit={handleSaveBook} className="flex-1 overflow-y-auto p-8 space-y-8">
                      <div className="grid md:grid-cols-4 gap-6">
                          <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-muted ml-1">Kitabın Adı</label>
                              <input required className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:ring-1 focus:ring-brand outline-none transition-all text-text" placeholder="Məs: Tarix-i İslam" value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})} />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-muted ml-1">Kateqoriya</label>
                              <input required className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:ring-1 focus:ring-brand outline-none transition-all text-text" placeholder="Məs: İlahiyyat" value={newBook.category} onChange={e => setNewBook({...newBook, category: e.target.value})} />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-muted ml-1">Dil</label>
                              <select required className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:ring-1 focus:ring-brand outline-none transition-all text-text" value={newBook.language} onChange={e => setNewBook({...newBook, language: e.target.value as Language})}>
                                  <option value="az">Азербайджанский</option>
                                  <option value="ru">Русский</option>
                                  <option value="ar">Арабский</option>
                                  <option value="tr">Турецкий</option>
                                  <option value="en">Английский</option>
                              </select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[11px] font-semibold text-muted ml-1">Üz Qabığı</label>
                              <div className="relative group">
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => setCoverImage(e.target.files?.[0] || null)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className={`w-full bg-background border border-dashed border-border rounded-xl p-4 flex items-center justify-center gap-2 transition-all ${coverImage ? 'border-brand bg-brand/5' : 'group-hover:border-brand/50'}`}>
                                  <ImageIcon className={`w-4 h-4 ${coverImage ? 'text-brand' : 'text-muted'}`} />
                                  <span className={`text-[11px] font-semibold truncate ${coverImage ? 'text-brand' : 'text-muted'}`}>
                                    {coverImage ? coverImage.name : 'Şəkil seç'}
                                  </span>
                                </div>
                              </div>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[11px] font-semibold text-muted ml-1">Məzmun</label>
                          <textarea required className="w-full bg-background border border-border rounded-2xl p-6 text-base font-semibold min-h-[350px] outline-none leading-relaxed focus:ring-1 focus:ring-brand transition-all text-text" placeholder="Kitabın mətni bura daxil edin..." value={newBook.content} onChange={e => setNewBook({...newBook, content: e.target.value})} />
                      </div>

                      <div className="space-y-4">
                          <label className="text-[11px] font-semibold text-muted ml-1">Oxu Effekti</label>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {[
                                  { id: 'none', label: 'Yoxdur' },
                                  { id: 'snow', label: 'Qar' },
                                  { id: 'fire', label: 'Alov' },
                                  { id: 'roses', label: 'Gül' },
                                  { id: 'leaves', label: 'Yarpaq' },
                                  { id: 'rain', label: 'Yağış' },
                              ].map(eff => (
                                  <button
                                      key={eff.id}
                                      type="button"
                                      onClick={() => setNewBook({ ...newBook, readingEffect: eff.id as any })}
                                      className={`py-3 rounded-xl text-[11px] font-semibold border transition-all ${
                                          newBook.readingEffect === eff.id 
                                          ? 'bg-brand text-white border-brand' 
                                          : 'bg-background text-muted border-border'
                                      }`}
                                  >
                                      {eff.label}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <button type="submit" disabled={isSaving} className="w-full bg-brand text-white py-5 rounded-xl font-semibold text-[11px] disabled:opacity-50 transition-all flex items-center justify-center">
                          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Kitabı yayımla"}
                      </button>
                  </form>
              </div>
          </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading ? (
              <div className="col-span-full py-40 flex flex-col items-center gap-6">
                  <Loader2 className="w-16 h-16 animate-spin text-muted/20" />
                  <p className="text-muted font-semibold text-[11px] ">Kitablar gətirilir...</p>
              </div>
          ) : filteredBooks.length > 0 ? filteredBooks.map(book => (
              <div key={book.id} className="group card card-hover !p-0 h-[400px] flex flex-col overflow-hidden">
                {book.coverUrl ? (
                  <div className="h-1/2 relative overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <div className="h-1/2 bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center">
                    <BookOpen className="w-12 h-12 text-brand-300 dark:text-brand-800" />
                  </div>
                )}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-medium">
                      <span className="text-brand-600 dark:text-brand-400 px-2 py-0.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl">{book.category}</span>
                      <span className="text-muted">{book.language?.toUpperCase() || ''}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-text leading-snug line-clamp-2">{book.title}</h3>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-[11px] text-muted truncate max-w-[110px]">{book.authorName}</span>
                    <div className="flex items-center gap-2">
                      {user.role === 'teacher' && (auth.currentUser?.uid === book.authorId) && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(book.id); }} className="p-2 text-muted hover:text-red-500 transition-colors rounded-xl border border-border">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setSelectedBook(book)} className="p-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors">
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
          )) : (
            <div className="col-span-full py-40 text-center space-y-6 bg-surface rounded-2xl border border-dashed border-border">
                <AlertCircle className="w-16 h-16 text-muted/20 mx-auto" />
                <p className="text-muted font-semibold text-[11px] ">Hələlik kitab tapılmadı.</p>
            </div>
          )}
      </div>
    </div>
  );
};
