
import React, { useState, useEffect } from 'react';
import { User, Service, UserService } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, LayoutGrid, Download, Trash2, ExternalLink, Loader2, Bookmark, Paintbrush, Calculator, FileText, Gamepad2, ClipboardList } from 'lucide-react';
import { Paint } from '../src/components/services/Paint';
import { Notes } from '../src/components/services/Notes';
import { Todo } from '../src/components/services/Todo';
import { Feed } from '../src/components/services/Feed';
import { IslamicGames } from '../src/components/services/IslamicGames';
import { Calculator as CalculatorService } from '../src/components/services/Calculator';
import { ExamService } from '../src/components/services/Exam';
import { Toast } from '../components/Toast';

interface ServicesProps {
  user: User;
}

export const Services: React.FC<ServicesProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'my' | 'store'>('my');
  const [storeServices, setStoreServices] = useState<Service[]>([]);
  const [myServices, setMyServices] = useState<UserService[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    // Fetch store services
    const unsubStore = onSnapshot(collection(db, 'services_store'), (snap) => {
      const services = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
      setStoreServices(services);
      
      // Seed store if empty (demo purposes)
      if (services.length === 0 && !loading) {
        seedStore();
      }
    }, (error) => {
      console.error('Store fetch error:', error);
      // Don't show full error to avoid blinking, just log it
    });

    // Fetch user installed services
    const q = query(collection(db, 'user_services'), where('userId', '==', user.uid));
    const unsubMy = onSnapshot(q, (snap) => {
      setMyServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserService)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'user_services');
    });

    return () => {
      unsubStore();
      unsubMy();
    };
  }, [user.uid, loading]);

  const seedStore = async () => {
    const initialServices = [
      { name: 'Paint', description: 'Rəsm çəkmək üçün sadə alət.', type: 'paint', icon: 'paintbrush' },
      { name: 'Kalkulyator', description: 'Riyazi hesablamalar üçün.', type: 'calculator', icon: 'calculator' },
      { name: 'Qeydlər', description: 'Vacib qeydlərinizi saxlayın.', type: 'notes', icon: 'file-text' },
      { name: 'Oyun', description: 'Boş vaxtlarınızda əylənin.', type: 'game', icon: 'gamepad-2' },
      { name: 'Tasklar', description: 'Məqsədlərinizi izləyin.', type: 'todo', icon: 'check-square' },
      { name: 'Mədrəsə Feed', description: 'Mədrəsə həyatından paylaşımlar.', type: 'feed', icon: 'rss' },
      { name: 'İmtahanlar', description: 'Biliklərinizi yoxlayın.', type: 'exam', icon: 'clipboard-list' },
    ];

    try {
      for (const s of initialServices) {
        await addDoc(collection(db, 'services_store'), {
          ...s,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Seeding failed:', error);
    }
  };

  const installService = async (service: Service) => {
    if (myServices.some(s => s.serviceId === service.id)) {
      showToast('Bu servis artıq quraşdırılıb.', 'error');
      return;
    }

    setInstalling(service.id);
    try {
      await addDoc(collection(db, 'user_services'), {
        userId: user.uid,
        serviceId: service.id,
        name: service.name,
        type: service.type,
        installedAt: serverTimestamp()
      });
      showToast(`${service.name}: успешно установлено!`, 'success');
      setActiveTab('my');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'user_services');
      showToast('Quraşdırma zamanı xəta baş verdi.', 'error');
    } finally {
      setInstalling(null);
    }
  };

  const uninstallService = async (userServiceId: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'user_services', userServiceId));
      showToast(`${name} silindi.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'user_services');
      showToast('Silinmə zamanı xəta baş verdi.', 'error');
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'paintbrush': return <Paintbrush className="w-5 h-5" />;
      case 'calculator': return <Calculator className="w-5 h-5" />;
      case 'file-text': return <FileText className="w-5 h-5" />;
      case 'gamepad-2': return <Gamepad2 className="w-5 h-5" />;
      case 'check-square': return <LayoutGrid className="w-5 h-5" />;
      case 'rss': return <Bookmark className="w-5 h-5" />;
      case 'clipboard-list': return <ClipboardList className="w-5 h-5" />;
      default: return <Bookmark className="w-5 h-5" />;
    }
  };

  const renderService = (type: string) => {
    switch (type) {
      case 'paint':
        return <Paint user={user} onClose={() => setActiveService(null)} />;
      case 'calculator':
        return <CalculatorService onClose={() => setActiveService(null)} />;
      case 'notes':
        return <Notes user={user} onClose={() => setActiveService(null)} />;
      case 'todo':
        return <Todo user={user} onClose={() => setActiveService(null)} />;
      case 'feed':
        return <Feed user={user} onClose={() => setActiveService(null)} />;
      case 'game':
        return <IslamicGames user={user} onClose={() => setActiveService(null)} />;
      case 'exam':
        return <ExamService user={user} onClose={() => setActiveService(null)} />;
      default:
        return (
          <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-md text-center space-y-4">
              <h3 className="text-xl font-semibold text-text">Bu servis hələ hazır deyil</h3>
              <p className="text-muted text-sm">Tezliklə istifadəyə veriləcək!</p>
              <button onClick={() => setActiveService(null)} className="bg-brand text-white px-6 py-2 rounded-xl font-semibold text-[11px] ">Bağla</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Servislər</h1>
          <p className="text-xs text-muted mt-0.5">Mədrəsə üçün faydalı alətlər</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('my')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all ${activeTab === 'my' ? 'bg-white text-text shadow-sm' : 'text-muted hover:text-text'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Mənim Servislərim</span>
          </button>
          <button 
            onClick={() => setActiveTab('store')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all ${activeTab === 'store' ? 'bg-white text-text shadow-sm' : 'text-muted hover:text-text'}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Mağaza</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <p className="text-muted text-[11px] font-semibold ">Yüklənir...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {activeTab === 'my' ? (
              myServices.length > 0 ? myServices.map((service) => (
                <motion.div 
                  key={service.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="card p-6 group hover:border-brand/20 transition-all cursor-pointer"
                  onClick={() => setActiveService(service.type)}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 bg-brand/5 rounded-2xl flex items-center justify-center text-brand group-hover:bg-brand group-hover:text-white transition-all">
                      {getIcon(storeServices.find(s => s.id === service.serviceId)?.icon || 'sparkles')}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        uninstallService(service.id, service.name);
                      }}
                      className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-text tracking-tight">{service.name}</h3>
                    <p className="text-muted text-[11px] font-semibold mt-1">Quraşdırılıb: {new Date(service.installedAt?.toDate?.() || Date.now()).toLocaleDateString('az-AZ')}</p>
                  </div>
                  <div className="mt-6 flex items-center text-brand text-[11px] font-semibold group-hover:translate-x-1 transition-transform">
                    <span>Açmaq</span>
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                    <LayoutGrid className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-muted text-[11px] font-semibold ">Hələ ki, heç bir servis quraşdırmamısınız.</p>
                  <button onClick={() => setActiveTab('store')} className="text-brand text-[11px] font-semibold hover:underline">Mağazaya get</button>
                </div>
              )
            ) : (
              storeServices.map((service) => {
                const isInstalled = myServices.some(s => s.serviceId === service.id);
                return (
                  <motion.div 
                    key={service.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="card p-6 flex flex-col h-full"
                  >
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-text mb-6">
                      {getIcon(service.icon)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-text tracking-tight">{service.name}</h3>
                      <p className="text-muted text-xs mt-2 leading-relaxed">{service.description}</p>
                    </div>
                    <div className="mt-8">
                      <button 
                        disabled={isInstalled || installing === service.id}
                        onClick={() => installService(service)}
                        className={`w-full flex items-center justify-center space-x-2 py-3 rounded-xl font-semibold text-[11px] transition-all ${
                          isInstalled 
                          ? 'bg-slate-100 text-muted cursor-not-allowed' 
                          : 'bg-brand text-white'
                        }`}
                      >
                        {installing === service.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isInstalled ? (
                          <span>Quraşdırılıb</span>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Quraşdır</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      )}

      {activeService && renderService(activeService)}
      {toast.visible && (
        <Toast 
          isVisible={toast.visible}
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast({ ...toast, visible: false })} 
        />
      )}
    </div>
  );
};
