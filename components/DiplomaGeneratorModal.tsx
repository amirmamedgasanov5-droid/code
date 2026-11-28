import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Send, Loader2, Award, BookOpen, Shield, Trophy, CheckCircle2 } from 'lucide-react';
import { DiplomaCard, DiplomaData } from './DiplomaCard';

interface Student {
  uid: string;
  name: string;
  surname?: string;
  username?: string;
}

interface DiplomaGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  teacherName: string;
  onSuccess?: () => void;
}

const TEMPLATES: Array<{
  type: DiplomaData['type'];
  title: string;
  icon: any;
  defaultReason: string;
  badge: string;
}> = [
  {
    type: 'diploma',
    title: 'Əla Təhsil və Qiymətlər Diplomu',
    icon: Award,
    defaultReason: 'Semestr ərzində dərslərdə göstərdiyi yüksək nəticələrə, bütün fənlərdən əla qiymətlərə və nümunəvi çalışqanlığına görə təltif edilir.',
    badge: 'Əla Təhsil',
  },
  {
    type: 'quran',
    title: 'Ayın Hafizi və Qurani-Kərim Uğuru',
    icon: BookOpen,
    defaultReason: 'Müqəddəs Qurani-Kərimin qiraəti, təcvid qaydalarına dərindən yiyələnməsi və ayələri məharətlə əzbərləməsindəki xüsusi uğurlarına görə.',
    badge: 'Quran Xətm',
  },
  {
    type: 'discipline',
    title: 'Dəmir İntizam və Nümunəvi Əxlaq Sertifikatı',
    icon: Shield,
    defaultReason: 'Mədrəsədə qayda-qanunlara kamil riayət etdiyinə, böyüklərə və müəllimlərə dərin hörmətinə, yüksək əxlaqi keyfiyyətlərinə görə.',
    badge: 'Dəmir İntizam',
  },
  {
    type: 'honor',
    title: 'Akademik Liqa Çempionatı Qızıl Sertifikatı',
    icon: Trophy,
    defaultReason: 'Mədrəsənin həftəlik akademik yarışlarında ən yüksək XP bal toplayaraq Liqa Lideri olduğuna görə təltif edilir.',
    badge: 'Liqa Çempionu',
  },
];

export const DiplomaGeneratorModal: React.FC<DiplomaGeneratorModalProps> = ({
  isOpen,
  onClose,
  students,
  teacherName,
  onSuccess,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [customTitle, setCustomTitle] = useState(TEMPLATES[0].title);
  const [customReason, setCustomReason] = useState(TEMPLATES[0].defaultReason);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  if (!isOpen) return null;

  const currentTemplate = TEMPLATES[selectedTemplateIndex];
  const selectedStudent = students.find((s) => s.uid === selectedStudentId);
  const studentDisplayName = selectedStudent
    ? `${selectedStudent.name} ${selectedStudent.surname || ''}`.trim()
    : 'Tələbənin Adı Soyadı';

  const handleTemplateSelect = (index: number) => {
    setSelectedTemplateIndex(index);
    setCustomTitle(TEMPLATES[index].title);
    setCustomReason(TEMPLATES[index].defaultReason);
  };

  const handleSaveAndSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      alert('Zəhmət olmasa tələbə seçin');
      return;
    }

    setIsSaving(true);
    try {
      const serialNumber = `NM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const dateString = new Date().toLocaleDateString('az-AZ', { day: 'numeric', month: 'long', year: 'numeric' });

      // 1. Save to `certificates` collection
      await addDoc(collection(db, 'certificates'), {
        type: currentTemplate.type === 'diploma' || currentTemplate.type === 'honor' ? 'diploma' : 'certificate',
        diplomaType: currentTemplate.type,
        title: customTitle,
        studentId: selectedStudentId,
        studentName: studentDisplayName,
        reason: customReason,
        teacherId: auth.currentUser?.uid || 'admin',
        teacherName: teacherName || 'Mədrəsə Rəhbərliyi',
        serialNumber,
        date: dateString,
        createdAt: serverTimestamp(),
      });

      // 2. Also send as official congratulation to Valideyn Portalı
      await addDoc(collection(db, 'congratulations'), {
        studentId: selectedStudentId,
        title: `Rəsmi Diplom: ${customTitle}`,
        message: customReason,
        teacherId: auth.currentUser?.uid || 'admin',
        teacherName: teacherName || 'Mədrəsə Rəhbərliyi',
        diplomaType: currentTemplate.type,
        serialNumber,
        createdAt: dateString,
      });

      setSuccessMessage(true);
      setTimeout(() => {
        setSuccessMessage(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error issuing diploma:', err);
      alert('Xəta baş verdi: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const previewData: DiplomaData = {
    studentName: studentDisplayName,
    type: currentTemplate.type,
    title: customTitle,
    reason: customReason,
    teacherName: teacherName || 'Mədrəsə Rəhbərliyi',
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-neutral-950/60 backdrop-blur-xs overflow-y-auto custom-scrollbar">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="relative w-full max-w-5xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl shadow-md p-5 sm:p-8 space-y-6 my-auto max-h-[92vh] overflow-y-auto custom-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-lg text-neutral-800 dark:text-neutral-200 border border-neutral-200/80 dark:border-neutral-800">
                              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Rəsmi Diplom və Qramota Generatoru
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  1 kliklə rəsmi diplom tərtib edin, çap edin və valideyn portalına göndərin
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Controls & Templates */}
            <div className="lg:col-span-5 space-y-5">
              {/* Student Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                  <span>Tələbəni Seçin</span>
                  <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-indigo-500 transition-all"
                  required
                >
                  <option value="">-- Tələbə seçin ({students.length} nəfər) --</option>
                  {students.map((stu) => (
                    <option key={stu.uid} value={stu.uid}>
                      {stu.name} {stu.surname || ''} {stu.username ? `(@${stu.username})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 1-Click Template Buttons */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                  Hazır Şablonlar:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TEMPLATES.map((tmpl, idx) => {
                    const IconComponent = tmpl.icon;
                    const isSelected = selectedTemplateIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleTemplateSelect(idx)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-neutral-900 dark:border-neutral-100 '
                            : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600'
                        }`}
                      >
                        <div
                          className={`p-1.5 rounded-xl ${
                            isSelected
                              ? 'bg-white/20 text-white dark:bg-neutral-900/20 dark:text-neutral-900'
                              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[11px] font-semibold block leading-tight truncate">
                            {tmpl.badge}
                          </span>
                          <span className={`text-[11px] block line-clamp-1 ${isSelected ? 'text-white/70 dark:text-neutral-900/70' : 'text-neutral-500 dark:text-neutral-400'}`}>
                            {tmpl.title}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                  Diplom Başlığı
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Custom Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block">
                  Təltif Mətni / Səbəb
                </label>
                <textarea
                  rows={3}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-indigo-500 leading-relaxed resize-none transition-colors"
                />
              </div>

              {/* Submit & Send to Parent Portal Button */}
              <button
                type="button"
                onClick={handleSaveAndSend}
                disabled={isSaving || !selectedStudentId}
                className="w-full py-2.5 rounded-xl btn-indigo font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Yadda saxlanılır...</span>
                  </>
                ) : successMessage ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-indigo-200" />
                    <span>Valideyn Portalına Göndərildi!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Diplomu Təsdiqlə & Valideynə Göndər</span>
                  </>
                )}
              </button>
            </div>

            {/* RIGHT COLUMN: Live 3D Diploma Preview & Print/Download */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold text-text">
                    Diplom önbaxışı
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-muted bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                  Çap və ya PNG kimi yükləyin
                </span>
              </div>

              <DiplomaCard data={previewData} />
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
