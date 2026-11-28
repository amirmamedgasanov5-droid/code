
import React, { useState, useEffect } from 'react';
import { X, Send, Heart, MessageCircle, Share2, Loader2, Image as ImageIcon, Trash2, User as UserIcon } from 'lucide-react';
import { db } from '../../../firebase';
import { collection, onSnapshot, query, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, orderBy, limit, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../utils/firestoreError';
import { uploadImageToImgBB } from '../../utils/imgbb';
import { User } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';

interface FeedProps {
  user: User;
  onClose: () => void;
}

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  imageUrl?: string;
  likesCount: number;
  createdAt: any;
}

export const Feed: React.FC<FeedProps> = ({ user, onClose }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'), 
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });

    return () => unsub();
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim() && !selectedImage) return;

    setPosting(true);
    try {
      let imageUrl = '';
      if (selectedImage) {
        imageUrl = await uploadImageToImgBB(selectedImage);
      }

      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: user.name,
        authorPhoto: user.photoURL || '',
        content: newPost.trim(),
        imageUrl: imageUrl || null,
        likesCount: 0,
        createdAt: serverTimestamp()
      });
      setNewPost('');
      setSelectedImage(null);
      setImagePreview(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setPosting(false);
    }
  };

  const likePost = async (id: string) => {
    try {
      await updateDoc(doc(db, 'posts', id), {
        likesCount: increment(1)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'posts');
    }
  };

  const deletePost = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'posts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'posts');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl h-[90vh] rounded-2xl shadow-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border bg-white flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-brand/10 rounded-full flex items-center justify-center text-brand">
              <Share2 className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-text text-xs">Mədrəsə Feed</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input */}
        <div className="p-6 border-b border-border bg-slate-50/50">
          <form onSubmit={createPost} className="space-y-4">
            <div className="flex space-x-4">
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
              </div>
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Nə baş verir?"
                className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-lg placeholder:text-slate-400 resize-none min-h-[80px]"
              />
            </div>
            
            {imagePreview && (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-border bg-slate-100 ml-14">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-slate-900/50 text-white rounded-full hover:bg-slate-900/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center">
                <input
                  type="file"
                  id="post-image"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <label 
                  htmlFor="post-image"
                  className="p-2 text-brand hover:bg-brand/5 rounded-full transition-all cursor-pointer"
                >
                  <ImageIcon className="w-5 h-5" />
                </label>
              </div>
              <button 
                type="submit"
                disabled={posting || !newPost.trim()}
                className="bg-brand text-white px-6 py-2 rounded-full font-semibold text-[11px] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center space-x-2"
              >
                {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Paylaş</span>
              </button>
            </div>
          </form>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {posts.map(post => (
                  <motion.div
                    key={post.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-6 hover:bg-slate-50/50 transition-all group"
                  >
                    <div className="flex space-x-4">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-slate-100">
                        {post.authorPhoto ? (
                          <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <UserIcon className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-text text-sm">{post.authorName}</span>
                            <span className="text-muted text-[11px] font-semibold ">
                              {new Date(post.createdAt?.toDate?.() || Date.now()).toLocaleDateString('az-AZ')}
                            </span>
                          </div>
                          {post.authorId === user.uid && (
                            <button 
                              onClick={() => deletePost(post.id)}
                              className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                        
                        {post.imageUrl && (
                          <div className="rounded-2xl overflow-hidden border border-border bg-slate-50 mt-4">
                            <img 
                              src={post.imageUrl} 
                              alt="Post content" 
                              className="w-full h-auto max-h-[400px] object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}

                        <div className="flex items-center space-x-6 pt-4">
                          <button 
                            onClick={() => likePost(post.id)}
                            className="flex items-center space-x-2 text-muted hover:text-red-500 transition-colors group/btn"
                          >
                            <div className="p-2 group-hover/btn:bg-red-50 rounded-full transition-all">
                              <Heart className={`w-4 h-4 ${post.likesCount > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                            </div>
                            <span className="text-xs font-semibold">{post.likesCount || 0}</span>
                          </button>
                          <button className="flex items-center space-x-2 text-muted hover:text-brand transition-colors group/btn">
                            <div className="p-2 group-hover/btn:bg-brand/5 rounded-full transition-all">
                              <MessageCircle className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-semibold">0</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
