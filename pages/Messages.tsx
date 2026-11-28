
import React, { useState, useEffect, useRef } from 'react';
import { User, GlobalMessage, Chat, Message as MessageType } from '../types';
import { Send, MessageCircle, Loader2, Image as ImageIcon, Maximize2, Minimize2, Users, Search, Plus, ArrowLeft } from 'lucide-react';
import { db } from '../firebase';
import { 
    collection, query, onSnapshot, orderBy, 
    addDoc, serverTimestamp, limit, where, getDocs, doc, updateDoc, setDoc
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { motion, AnimatePresence } from 'motion/react';

interface MessagesProps {
    user: User;
}

type ChatType = 'global' | 'personal';

export const Messages: React.FC<MessagesProps> = ({ user }) => {
    const [activeChatId, setActiveChatId] = useState<string>('global');
    const [activeChatType, setActiveChatType] = useState<ChatType>('global');
    const [chats, setChats] = useState<Chat[]>([]);
    const [messages, setMessages] = useState<(GlobalMessage | MessageType)[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [uploading, setUploading] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showUserSearch, setShowUserSearch] = useState(false);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. Fetch Personal Chats
    useEffect(() => {
        if (!user.uid) return;
        const chatsRef = collection(db, 'chats');
        // Removing orderBy to avoid index requirement for now
        const q = query(chatsRef, where('participants', 'array-contains', user.uid));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chatList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Chat));
            // Manual sort by updatedAt if needed
            chatList.sort((a, b) => {
                const timeA = (a.updatedAt as any)?.seconds || 0;
                const timeB = (b.updatedAt as any)?.seconds || 0;
                return timeB - timeA;
            });
            setChats(chatList);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

        return () => unsubscribe();
    }, [user.uid]);

    // 2. Fetch Active Chat Messages
    useEffect(() => {
        setLoading(true);
        let q;
        if (activeChatType === 'global') {
            q = query(collection(db, 'global_messages'), orderBy('createdAt', 'asc'), limit(100));
        } else {
            if (!activeChatId || activeChatId === 'global') return;
            q = query(collection(db, 'chats', activeChatId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as any));
            setMessages(msgs);
            setLoading(false);
        }, (error) => {
            console.error("Messages fetch error:", error);
            handleFirestoreError(error, OperationType.LIST, activeChatType === 'global' ? 'global_messages' : `chats/${activeChatId}/messages`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeChatId, activeChatType]);

    // Auto-scroll on message change
    useEffect(() => {
        if (messages.length > 0) {
            const timer = setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [messages.length]);

    // 3. Fetch Users for Search
    const fetchUsers = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'users'));
            const users = snapshot.docs
                .map(doc => ({ uid: doc.id, ...doc.data() } as User))
                .filter(u => u.uid !== user.uid);
            setAllUsers(users);
        } catch (error) {
            console.error("User fetch error:", error);
        }
    };

    const startNewChat = async (targetUser: User) => {
        // Uniform ID sorting for deterministic chat ID lookup
        const participantIds = [user.uid, targetUser.uid].sort();
        
        // Check if chat already exists
        const existingChat = chats.find(c => 
            c.participants.length === 2 && 
            c.participants.includes(targetUser.uid) && 
            c.participants.includes(user.uid)
        );

        if (existingChat) {
            setActiveChatId(existingChat.id);
            setActiveChatType('personal');
            setShowUserSearch(false);
            return;
        }

        // Create new chat
        try {
            const chatRef = await addDoc(collection(db, 'chats'), {
                participants: participantIds,
                participantNames: {
                    [user.uid]: user.name,
                    [targetUser.uid]: targetUser.name
                },
                lastMessage: '',
                updatedAt: serverTimestamp()
            });
            setActiveChatId(chatRef.id);
            setActiveChatType('personal');
            setShowUserSearch(false);
        } catch (error) {
            console.error("Create chat error:", error);
            handleFirestoreError(error, OperationType.WRITE, 'chats');
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = newMessage.trim();
        if (!text) return;

        setNewMessage(''); 

        try {
            if (activeChatType === 'global') {
                await addDoc(collection(db, 'global_messages'), {
                    senderId: user.uid,
                    senderName: user.name,
                    text: text,
                    createdAt: serverTimestamp()
                });
            } else {
                const chatRef = doc(db, 'chats', activeChatId);
                await addDoc(collection(chatRef, 'messages'), {
                    senderId: user.uid,
                    text: text,
                    createdAt: serverTimestamp()
                });
                await updateDoc(chatRef, {
                    lastMessage: text,
                    lastMessageSenderId: user.uid,
                    updatedAt: serverTimestamp()
                });
            }

            if (user.soundEffects) {
                import('../src/utils/sounds').then(m => m.playSound('message'));
            }
        } catch (error) {
            console.error("Send message error:", error);
            setNewMessage(text);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 500 * 1024) {
            alert("Şəkil çox böyükdür. Maksimum 500KB.");
            return;
        }

        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            try {
                if (activeChatType === 'global') {
                    await addDoc(collection(db, 'global_messages'), {
                        senderId: user.uid,
                        senderName: user.name,
                        imageUrl: base64String,
                        createdAt: serverTimestamp()
                    });
                } else {
                    const chatRef = doc(db, 'chats', activeChatId);
                    await addDoc(collection(chatRef, 'messages'), {
                        senderId: user.uid,
                        imageUrl: base64String,
                        createdAt: serverTimestamp()
                    });
                    await updateDoc(chatRef, {
                        lastMessage: 'Şəkil',
                        lastMessageSenderId: user.uid,
                        updatedAt: serverTimestamp()
                    });
                }
            } catch (error) {
                console.error("Image upload error:", error);
            } finally {
                setUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const filteredUsers = allUsers.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getChatName = (chat: Chat) => {
        const otherParticipantId = chat.participants.find(p => p !== user.uid);
        return otherParticipantId ? chat.participantNames[otherParticipantId] : 'Naməlum';
    };

    return (
        <div className={`flex flex-col gap-4 md:gap-8 animate-reveal pb-4 h-[calc(100vh-9rem)] md:h-[calc(100vh-8rem)] ${isFullScreen ? 'fixed inset-0 z-[3000] h-screen w-screen bg-slate-900/10' : ''}`}>
            <div className={`flex-1 flex bg-surface border border-border rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${isFullScreen ? 'm-0 h-full w-full' : ''}`}>
                
                {/* Chat Sidebar */}
                <div className={`${showUserSearch || activeChatId !== 'global' ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-border bg-slate-50/50`}>
                    <div className="p-6 border-b border-border space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-text ">Söhbətlər</h3>
                            <button 
                                onClick={() => {
                                    setShowUserSearch(true);
                                    fetchUsers();
                                }}
                                className="p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand hover:text-white transition-all shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                            <input 
                                type="text"
                                placeholder={showUserSearch ? "İstifadəçi axtar..." : "Söhbət axtar..."}
                                className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2 text-[11px] font-semibold text-text outline-none focus:border-brand/40"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                        {/* Global Chat Item */}
                        <button 
                            onClick={() => {
                                setActiveChatId('global');
                                setActiveChatType('global');
                            }}
                            className={`w-full flex items-center space-x-3 p-4 rounded-2xl transition-all ${activeChatId === 'global' ? 'bg-brand text-white' : 'hover:bg-background text-text'}`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeChatId === 'global' ? 'bg-white/20' : 'bg-brand/10 text-brand'}`}>
                                <Users className="w-5 h-5" />
                            </div>
                            <div className="text-left overflow-hidden">
                                <p className="text-[11px] font-semibold truncate">Ümumi Söhbət</p>
                                <p className={`text-[11px] truncate ${activeChatId === 'global' ? 'text-white/70' : 'text-muted'}`}>Bütün mədrəsə burada</p>
                            </div>
                        </button>

                        <div className="mt-6 mb-2">
                          <p className="text-[11px] font-semibold text-muted px-4">Şəxsi Mesajlar</p>
                        </div>

                        {chats.map(chat => {
                            const isActive = activeChatId === chat.id;
                            return (
                                <button 
                                    key={chat.id}
                                    onClick={() => {
                                        setActiveChatId(chat.id);
                                        setActiveChatType('personal');
                                    }}
                                    className={`w-full flex items-center space-x-3 p-4 rounded-2xl transition-all ${isActive ? 'bg-white text-brand shadow-md border border-brand/20' : 'hover:bg-background text-text'}`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-semibold ${isActive ? 'bg-brand text-white' : 'bg-slate-200 text-muted'}`}>
                                        {getChatName(chat).charAt(0)}
                                    </div>
                                    <div className="text-left overflow-hidden">
                                        <p className="text-[11px] font-semibold truncate">{getChatName(chat)}</p>
                                        <p className="text-[11px] truncate text-muted">{chat.lastMessage || 'Mesaj yoxdur'}</p>
                                    </div>
                                </button>
                            );
                        })}

                        {chats.length === 0 && (
                          <div className="py-20 text-center space-y-4">
                            <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="text-[11px] font-semibold text-muted ">Hələ şəxsi söhbət yoxdur</p>
                          </div>
                        )}
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className={`flex-1 flex flex-col min-w-0 ${showUserSearch || activeChatId !== 'global' ? 'flex' : 'hidden md:flex'}`}>
                    {showUserSearch ? (
                        <div className="flex-1 flex flex-col bg-background/30 overflow-hidden">
                            <div className="p-6 border-b border-border flex items-center space-x-4 shrink-0">
                                <button onClick={() => setShowUserSearch(false)} className="p-2 hover:bg-slate-100 rounded-xl text-muted">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h3 className="text-xs font-semibold text-text ">Yeni Söhbət Başlat</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar" style={{ minHeight: '300px' }}>
                                {filteredUsers.map(u => (
                                    <button 
                                        key={u.uid}
                                        onClick={() => startNewChat(u)}
                                        className="w-full flex items-center justify-between p-4 bg-surface border border-border rounded-2xl hover:border-brand/30 hover:shadow-sm transition-all shrink-0"
                                    >
                                        <div className="flex items-center space-x-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-brand font-semibold">
                                                {u.name.charAt(0)}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-semibold text-text">{u.name}</p>
                                                <p className="text-[11px] text-muted font-semibold ">@{u.username || 'user'}</p>
                                            </div>
                                        </div>
                                        <Plus className="w-4 h-4 text-brand" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="p-6 border-b border-border flex items-center justify-between bg-surface">
                                <div className="flex items-center space-x-4">
                                    <button onClick={() => setActiveChatId('global')} className="md:hidden p-2 text-muted">
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div className="w-10 h-10 rounded-2xl bg-brand/5 flex items-center justify-center text-brand font-semibold shadow-sm border border-brand/10">
                                        {activeChatType === 'global' ? <Users className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h3 className="text-[11px] font-semibold text-text ">
                                            {activeChatType === 'global' ? 'Ümumi Söhbət' : getChatName(chats.find(c => c.id === activeChatId)!)}
                                        </h3>
                                        <p className="text-[11px] text-green-500 font-semibold ">Onlayn</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsFullScreen(!isFullScreen)}
                                    className="p-2.5 rounded-xl border border-border bg-background text-muted hover:text-text transition-all shadow-sm"
                                >
                                    {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Message Feed */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 bg-background/10 custom-scrollbar scroll-smooth">
                                {loading ? (
                                    <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
                                        <Loader2 className="w-6 h-6 animate-spin text-brand" />
                                        <p className="text-[11px] font-semibold text-muted ">Mesajlar yüklənir...</p>
                                    </div>
                                ) : (
                                    messages.map((msg, idx) => {
                                        const isMe = msg.senderId === user.uid;
                                        return (
                                            <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-reveal`}>
                                                <div className="flex flex-col space-y-1 max-w-[85%] md:max-w-[70%]">
                                                    {!isMe && activeChatType === 'global' && (
                                                      <span className="text-[11px] font-semibold text-muted ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {(msg as GlobalMessage).senderName}
                                                      </span>
                                                    )}
                                                    <div className={`relative ${msg.imageUrl ? 'p-1' : 'px-4 py-3'} rounded-2xl text-[11px] font-medium leading-relaxed shadow-sm transition-all ${
                                                        isMe 
                                                        ? 'bg-brand text-white rounded-tr-none' 
                                                        : 'bg-surface text-text border border-border rounded-tl-none'
                                                    }`}>
                                                        {msg.imageUrl ? (
                                                            <img 
                                                                src={msg.imageUrl} 
                                                                alt="Message" 
                                                                className="rounded-xl max-w-full h-auto object-cover max-h-60"
                                                                referrerPolicy="no-referrer"
                                                            />
                                                        ) : (
                                                            msg.text
                                                        )}
                                                        <span className={`text-[11px] font-semibold tracking-tight mt-1.5 flex justify-end opacity-50`}>
                                                            {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 md:p-8 border-t border-border bg-surface">
                                <form onSubmit={handleSendMessage} className="flex gap-2 md:gap-4 items-center">
                                    <input 
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className="p-3.5 rounded-2xl border border-border bg-background text-muted hover:text-text transition-all shadow-sm"
                                    >
                                        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                                    </button>
                                    <input 
                                        type="text" 
                                        className="flex-1 bg-background border border-border rounded-xl px-6 py-3.5 text-xs font-medium text-text focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:text-muted/50"
                                        placeholder="Mesajınızı yazın..."
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                    />
                                    <button 
                                        type="submit"
                                        disabled={!newMessage.trim()}
                                        className="bg-brand text-white p-3.5 rounded-xl hover:opacity-95 disabled:opacity-50 transition-all active:rotate-12"
                                    >
                                        <Send className="w-5 h-5" />
                                    </button>
                                </form>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
