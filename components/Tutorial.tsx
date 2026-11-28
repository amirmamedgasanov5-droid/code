
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, Bookmark, Home, Calendar, BookOpen, Library, MessageCircle, Settings, User as UserIcon, Archive, CheckSquare } from 'lucide-react';
import { User } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';

interface Step {
  title: string;
  content: string;
  icon: any;
  path?: string;
  instruction?: string;
}

interface TutorialProps {
  user: User;
}

export const Tutorial: React.FC<TutorialProps> = ({ user }) => {
  const [show, setShow] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const steps: Step[] = [
    {
      title: "Xoş Gəldiniz!",
      content: "Nəsihetlər Mədrəsesi portalına xoş gəldiniz. Gəlin sizə platformanı necə istifadə edəcəyinizi göstərək.",
      icon: Bookmark
    },
    {
      title: "Ana Səhifə",
      content: "Burada ən son elanları, liderlər şurasını və bugünkü dərslərinizi görə bilərsiniz.",
      icon: Home,
      path: "/",
      instruction: "Ana səhifəyə keçid edin."
    },
    {
      title: "Dərs Cədvəli",
      content: "Bütün həftəlik dərslərinizi və onlayn dərs linklərini buradan tapa bilərsiniz.",
      icon: Calendar,
      path: "/schedule",
      instruction: "Cədvələ baxmaq üçün bura klikləyin."
    },
    {
      title: "Tapşırıqlar",
      content: "Ev tapşırıqları, sınaqlar və imtahanlar burada yerləşir. Cavablarınızı buradan göndərə bilərsiniz.",
      icon: BookOpen,
      path: "/homework",
      instruction: "Tapşırıqlar bölməsinə keçin."
    },
    {
      title: "İmtahanlar",
      content: "İmtahanlar bölməsinə daxil olmaq üçün 'Tapşırıqlar' səhifəsində 'İmtahan' tabını seçin.",
      icon: CheckSquare,
      path: "/homework",
      instruction: "İmtahanlar tabına klikləyin."
    },
    {
      title: "Arxiv",
      content: "Köhnə tapşırıqları görmək üçün 'Tapşırıqlar' səhifəsində 'Arxiv' tabına keçid edin.",
      icon: Archive,
      path: "/homework",
      instruction: "Arxiv bölməsini yoxlayın."
    },
    {
      title: "Kitabxana",
      content: "Dərs vəsaitləri, kitablar və faydalı materiallar burada toplanıb.",
      icon: Library,
      path: "/library",
      instruction: "Kitabxanaya daxil olun."
    },
    {
      title: "Mesajlar",
      content: "Müəllimlər və digər tələbələrlə birbaşa əlaqə saxlamaq üçün mesajlaşma bölməsindən istifadə edin.",
      icon: MessageCircle,
      path: "/messages",
      instruction: "Mesajlar bölməsinə keçin."
    },
    {
      title: "Tənzimləmələr",
      content: "Profilinizi, dil seçiminizi və tətbiqin görünüşünü (qaranlıq rejim, krem rəngi və s.) buradan dəyişə bilərsiniz.",
      icon: Settings,
      path: "/settings",
      instruction: "Tənzimləmələrə daxil olun."
    },
    {
      title: "Hazırsınız!",
      content: "İndi platformadan tam istifadə edə bilərsiniz. Uğurlar arzulayırıq!",
      icon: UserIcon
    }
  ];

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem(`tutorial_seen_${user.id}`);
    if (!hasSeenTutorial) {
      setShow(true);
    }
  }, [user.id]);

  const handleClose = () => {
    localStorage.setItem(`tutorial_seen_${user.id}`, 'true');
    setShow(false);
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
      const nextPath = steps[currentStep + 1].path;
      if (nextPath && location.pathname !== nextPath) {
        navigate(nextPath);
      }
    } else {
      handleClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      const prevPath = steps[currentStep - 1].path;
      if (prevPath && location.pathname !== prevPath) {
        navigate(prevPath);
      }
    }
  };

  if (!show) return null;

  const step = steps[currentStep];

  return (
    <AnimatePresence>
      <div className="fixed bottom-8 right-8 z-[3000] w-full max-w-sm pointer-events-none">
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          className="bg-surface rounded-2xl shadow-md border border-border pointer-events-auto overflow-hidden relative"
        >
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 h-1 bg-brand transition-all duration-500" style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} />
          
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-background rounded-xl flex items-center justify-center text-text border border-border shadow-sm">
                  <step.icon className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-muted ">Mədrəsə Bələdçisi</span>
                  <h3 className="text-sm font-semibold text-text tracking-tight">{step.title}</h3>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 text-muted hover:text-text transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-muted text-xs font-medium leading-relaxed">{step.content}</p>
              {step.instruction && (
                <div className="flex items-center gap-2 text-brand text-[11px] font-semibold">
                  <ChevronRight className="w-3 h-3" />
                  {step.instruction}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-semibold text-muted ">{currentStep + 1} / {steps.length}</span>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button 
                    onClick={prevStep}
                    className="px-4 py-2 bg-background text-text rounded-xl border border-border text-[11px] font-semibold transition-all"
                  >
                    Geri
                  </button>
                )}
                <button 
                  onClick={nextStep}
                  className="bg-brand text-white px-6 py-2 rounded-xl font-semibold text-[11px] flex items-center gap-2 transition-all"
                >
                  {currentStep === steps.length - 1 ? "Bitir" : "Növbəti"}
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
