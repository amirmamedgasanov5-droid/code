import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, SkipBack, SkipForward, Repeat, Volume2, VolumeX,
  Search, BookOpen, Headphones, Brain, Bookmark, CheckCircle2,
  Eye, EyeOff, Sparkles, RefreshCw, Layers, Sliders, ChevronRight,
  ListMusic, RotateCcw, Copy, Share2, Info, Loader2, Heart, Star
} from 'lucide-react';
import { Toast, ToastType } from '../components/Toast';

interface QuranProps {
  user: User;
}

interface SurahMeta {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface AyahData {
  numberInSurah: number;
  text: string;
  audio?: string;
  translationText?: string;
}

const RECITERS = [
  { id: 'ar.alafasy', name: 'Mişari Rəşid əl-Afasi', style: 'Məşhur, aydın' },
  { id: 'ar.abdulbasitmujawwad', name: 'Əbdülbasit Əbdülsəməd', style: 'Mücavvəd, klassik' },
  { id: 'ar.minshawi', name: 'Məhəmməd Siddiq əl-Minşavi', style: 'Tərtil, duyğulu' },
  { id: 'ar.husary', name: 'Mahmud Xəlil əl-Husari', style: 'Təcvid ustadı, əzbər üçün əla' },
  { id: 'ar.shaatree', name: 'Əbu Bəkr əş-Şatiri', style: 'Sakit tərz' },
  { id: 'ar.ghanim', name: 'Səəd əl-Qamidi', style: 'Məşhur tərtil' },
  { id: 'ar.mahermuaiqly', name: 'Mahir əl-Mueyqli', style: 'Hərəm imamı' },
];

const TRANSLATIONS = [
  { id: 'az.mammadaliyev', name: 'Azərbaycan dili (Məmmədəliyev & Bünyadov)' },
  { id: 'ru.kuliev', name: 'Русский (Эльмир Кулиев)' },
  { id: 'en.sahih', name: 'English (Saheeh International)' },
];

// Pre-stored 114 Surahs metadata
const ALL_SURAHS: SurahMeta[] = [
  { number: 1, name: "الفاتحة", englishName: "Al-Fatiha", englishNameTranslation: "Açılış", numberOfAyahs: 7, revelationType: "Meccan" },
  { number: 2, name: "البقرة", englishName: "Al-Baqarah", englishNameTranslation: "Bəqərə (İnək)", numberOfAyahs: 286, revelationType: "Medinan" },
  { number: 3, name: "آل عمران", englishName: "Ali 'Imran", englishNameTranslation: "İmran Ailəsi", numberOfAyahs: 200, revelationType: "Medinan" },
  { number: 4, name: "النساء", englishName: "An-Nisa", englishNameTranslation: "Qadınlar", numberOfAyahs: 176, revelationType: "Medinan" },
  { number: 5, name: "المائدة", englishName: "Al-Ma'idah", englishNameTranslation: "Süfrə", numberOfAyahs: 120, revelationType: "Medinan" },
  { number: 6, name: "الأنعام", englishName: "Al-An'am", englishNameTranslation: "Maldar heyvanlar", numberOfAyahs: 165, revelationType: "Meccan" },
  { number: 7, name: "الأعراف", englishName: "Al-A'raf", englishNameTranslation: "Əraf (Sədd)", numberOfAyahs: 206, revelationType: "Meccan" },
  { number: 8, name: "الأنفال", englishName: "Al-Anfal", englishNameTranslation: "Qənimətlər", numberOfAyahs: 75, revelationType: "Medinan" },
  { number: 9, name: "التوبة", englishName: "At-Tawbah", englishNameTranslation: "Tövbə", numberOfAyahs: 129, revelationType: "Medinan" },
  { number: 10, name: "يونس", englishName: "Yunus", englishNameTranslation: "Yunus Peyğəmbər", numberOfAyahs: 109, revelationType: "Meccan" },
  { number: 11, name: "هود", englishName: "Hud", englishNameTranslation: "Hud Peyğəmbər", numberOfAyahs: 123, revelationType: "Meccan" },
  { number: 12, name: "يوسف", englishName: "Yusuf", englishNameTranslation: "Yusif Peyğəmbər", numberOfAyahs: 111, revelationType: "Meccan" },
  { number: 13, name: "الرعد", englishName: "Ar-Ra'd", englishNameTranslation: "Göy gürultusu", numberOfAyahs: 43, revelationType: "Medinan" },
  { number: 14, name: "إبراهيم", englishName: "Ibrahim", englishNameTranslation: "İbrahim Peyğəmbər", numberOfAyahs: 52, revelationType: "Meccan" },
  { number: 15, name: "الحجر", englishName: "Al-Hijr", englishNameTranslation: "Hicr vadi-si", numberOfAyahs: 99, revelationType: "Meccan" },
  { number: 16, name: "النحل", englishName: "An-Nahl", englishNameTranslation: "Bal arısı", numberOfAyahs: 128, revelationType: "Meccan" },
  { number: 17, name: "الإسراء", englishName: "Al-Isra", englishNameTranslation: "Gecə səfəri", numberOfAyahs: 111, revelationType: "Meccan" },
  { number: 18, name: "الكهف", englishName: "Al-Kahf", englishNameTranslation: "Mağara", numberOfAyahs: 110, revelationType: "Meccan" },
  { number: 19, name: "مريم", englishName: "Maryam", englishNameTranslation: "Məryəm", numberOfAyahs: 98, revelationType: "Meccan" },
  { number: 20, name: "طه", englishName: "Taha", englishNameTranslation: "Taha", numberOfAyahs: 135, revelationType: "Meccan" },
  { number: 21, name: "الأنبياء", englishName: "Al-Anbiya", englishNameTranslation: "Peyğəmbərlər", numberOfAyahs: 112, revelationType: "Meccan" },
  { number: 22, name: "الحج", englishName: "Al-Hajj", englishNameTranslation: "Həcc", numberOfAyahs: 78, revelationType: "Medinan" },
  { number: 23, name: "المؤمنون", englishName: "Al-Mu'minun", englishNameTranslation: "Möminlər", numberOfAyahs: 118, revelationType: "Meccan" },
  { number: 24, name: "النور", englishName: "An-Nur", englishNameTranslation: "Nur", numberOfAyahs: 64, revelationType: "Medinan" },
  { number: 25, name: "الفرقان", englishName: "Al-Furqan", englishNameTranslation: "Fərqləndirən", numberOfAyahs: 77, revelationType: "Meccan" },
  { number: 26, name: "الشعراء", englishName: "Ash-Shu'ara", englishNameTranslation: "Şairlər", numberOfAyahs: 227, revelationType: "Meccan" },
  { number: 27, name: "النمل", englishName: "An-Naml", englishNameTranslation: "Qarışqalar", numberOfAyahs: 93, revelationType: "Meccan" },
  { number: 28, name: "القصص", englishName: "Al-Qasas", englishNameTranslation: "Qissələr", numberOfAyahs: 88, revelationType: "Meccan" },
  { number: 29, name: "العنكبوت", englishName: "Al-'Ankabut", englishNameTranslation: "Hörümçək", numberOfAyahs: 69, revelationType: "Meccan" },
  { number: 30, name: "الروم", englishName: "Ar-Rum", englishNameTranslation: "Rumlular", numberOfAyahs: 60, revelationType: "Meccan" },
  { number: 31, name: "لقمان", englishName: "Luqman", englishNameTranslation: "Loğman", numberOfAyahs: 34, revelationType: "Meccan" },
  { number: 32, name: "السجدة", englishName: "As-Sajdah", englishNameTranslation: "Səcdə", numberOfAyahs: 30, revelationType: "Meccan" },
  { number: 33, name: "الأحزاب", englishName: "Al-Ahzab", englishNameTranslation: "Dəstələr", numberOfAyahs: 73, revelationType: "Medinan" },
  { number: 34, name: "سبأ", englishName: "Saba", englishNameTranslation: "Səba", numberOfAyahs: 54, revelationType: "Meccan" },
  { number: 35, name: "فاطر", englishName: "Fatir", englishNameTranslation: "Yaradan", numberOfAyahs: 45, revelationType: "Meccan" },
  { number: 36, name: "يس", englishName: "Ya-Sin", englishNameTranslation: "Yasin", numberOfAyahs: 83, revelationType: "Meccan" },
  { number: 37, name: "الصافات", englishName: "As-Saffat", englishNameTranslation: "Səf-səf duranlar", numberOfAyahs: 182, revelationType: "Meccan" },
  { number: 38, name: "ص", englishName: "Sad", englishNameTranslation: "Sad", numberOfAyahs: 88, revelationType: "Meccan" },
  { number: 39, name: "الزمر", englishName: "Az-Zumar", englishNameTranslation: "Zümrələr", numberOfAyahs: 75, revelationType: "Meccan" },
  { number: 40, name: "غافر", englishName: "Ghafir", englishNameTranslation: "Bağışlayan", numberOfAyahs: 85, revelationType: "Meccan" },
  { number: 41, name: "فصلت", englishName: "Fussilat", englishNameTranslation: "Müfəssəl izah edilmiş", numberOfAyahs: 54, revelationType: "Meccan" },
  { number: 42, name: "الشورى", englishName: "Ash-Shura", englishNameTranslation: "Məşvərət", numberOfAyahs: 53, revelationType: "Meccan" },
  { number: 43, name: "الزخرف", englishName: "Az-Zukhruf", englishNameTranslation: "Qızıl bəzəklər", numberOfAyahs: 89, revelationType: "Meccan" },
  { number: 44, name: "الدخان", englishName: "Ad-Dukhan", englishNameTranslation: "Duman", numberOfAyahs: 59, revelationType: "Meccan" },
  { number: 45, name: "الجاثية", englishName: "Al-Jathiyah", englishNameTranslation: "Diz çökən camaat", numberOfAyahs: 37, revelationType: "Meccan" },
  { number: 46, name: "الأحقاف", englishName: "Al-Ahqaf", englishNameTranslation: "Qum təpələri", numberOfAyahs: 35, revelationType: "Meccan" },
  { number: 47, name: "محمد", englishName: "Muhammad", englishNameTranslation: "Məhəmməd", numberOfAyahs: 38, revelationType: "Medinan" },
  { number: 48, name: "الفتح", englishName: "Al-Fath", englishNameTranslation: "Fətəh (Qələbə)", numberOfAyahs: 29, revelationType: "Medinan" },
  { number: 49, name: "الحجرات", englishName: "Al-Hujurat", englishNameTranslation: "Otaqlar", numberOfAyahs: 18, revelationType: "Medinan" },
  { number: 50, name: "ق", englishName: "Qaf", englishNameTranslation: "Qaf", numberOfAyahs: 45, revelationType: "Meccan" },
  { number: 51, name: "الذاريات", englishName: "Adh-Dhariyat", englishNameTranslation: "Toz-torpaq sovuranlar", numberOfAyahs: 60, revelationType: "Meccan" },
  { number: 52, name: "الطور", englishName: "At-Tur", englishNameTranslation: "Tur dağı", numberOfAyahs: 49, revelationType: "Meccan" },
  { number: 53, name: "النجم", englishName: "An-Najm", englishNameTranslation: "Ulduz", numberOfAyahs: 62, revelationType: "Meccan" },
  { number: 54, name: "القمر", englishName: "Al-Qamar", englishNameTranslation: "Ay", numberOfAyahs: 55, revelationType: "Meccan" },
  { number: 55, name: "الرحمن", englishName: "Ar-Rahman", englishNameTranslation: "Rəhman (Mərhəmətli)", numberOfAyahs: 78, revelationType: "Medinan" },
  { number: 56, name: "الواقعة", englishName: "Al-Waqi'ah", englishNameTranslation: "Vaqiə (Qiyamət)", numberOfAyahs: 96, revelationType: "Meccan" },
  { number: 57, name: "الحديد", englishName: "Al-Hadid", englishNameTranslation: "Dəmir", numberOfAyahs: 29, revelationType: "Medinan" },
  { number: 58, name: "المجادلة", englishName: "Al-Mujadila", englishNameTranslation: "Mücadilə edən qadın", numberOfAyahs: 22, revelationType: "Medinan" },
  { number: 59, name: "الحشر", englishName: "Al-Hashr", englishNameTranslation: "Sürgün", numberOfAyahs: 24, revelationType: "Medinan" },
  { number: 60, name: "الممتحنة", englishName: "Al-Mumtahanah", englishNameTranslation: "Sınağa çəkilən qadın", numberOfAyahs: 13, revelationType: "Medinan" },
  { number: 61, name: "الصف", englishName: "As-Saff", englishNameTranslation: "Səf (Sıra)", numberOfAyahs: 14, revelationType: "Medinan" },
  { number: 62, name: "الجمعة", englishName: "Al-Jumu'ah", englishNameTranslation: "Cümə", numberOfAyahs: 11, revelationType: "Medinan" },
  { number: 63, name: "المنافقون", englishName: "Al-Munafiqun", englishNameTranslation: "Münafiqlər", numberOfAyahs: 11, revelationType: "Medinan" },
  { number: 64, name: "التغابن", englishName: "At-Taghabun", englishNameTranslation: "Qarşılıqlı aldanma", numberOfAyahs: 18, revelationType: "Medinan" },
  { number: 65, name: "الطلاق", englishName: "At-Talaq", englishNameTranslation: "Boşanma", numberOfAyahs: 12, revelationType: "Medinan" },
  { number: 66, name: "التحريم", englishName: "At-Tahrim", englishNameTranslation: "Qadağan etmə", numberOfAyahs: 12, revelationType: "Medinan" },
  { number: 67, name: "الملك", englishName: "Al-Mulk", englishNameTranslation: "Mülk (Hökmdarlıq)", numberOfAyahs: 30, revelationType: "Meccan" },
  { number: 68, name: "القلم", englishName: "Al-Qalam", englishNameTranslation: "Qələm", numberOfAyahs: 52, revelationType: "Meccan" },
  { number: 69, name: "الحاقة", englishName: "Al-Haqqah", englishNameTranslation: "Haqq olan qiyamət", numberOfAyahs: 52, revelationType: "Meccan" },
  { number: 70, name: "المعارج", englishName: "Al-Ma'arij", englishNameTranslation: "Pillələr", numberOfAyahs: 44, revelationType: "Meccan" },
  { number: 71, name: "نوح", englishName: "Nuh", englishNameTranslation: "Nuh Peyğəmbər", numberOfAyahs: 28, revelationType: "Meccan" },
  { number: 72, name: "الجن", englishName: "Al-Jinn", englishNameTranslation: "Cinlər", numberOfAyahs: 28, revelationType: "Meccan" },
  { number: 73, name: "المزمل", englishName: "Al-Muzzammil", englishNameTranslation: "Bürünən kəs", numberOfAyahs: 20, revelationType: "Meccan" },
  { number: 74, name: "المدثر", englishName: "Al-Muddaththir", englishNameTranslation: "Bürünmüş kəs", numberOfAyahs: 56, revelationType: "Meccan" },
  { number: 75, name: "القيامة", englishName: "Al-Qiyamah", englishNameTranslation: "Qiyamət", numberOfAyahs: 40, revelationType: "Meccan" },
  { number: 76, name: "الإنسان", englishName: "Al-Insan", englishNameTranslation: "İnsan", numberOfAyahs: 31, revelationType: "Medinan" },
  { number: 77, name: "المرسلات", englishName: "Al-Mursalat", englishNameTranslation: "Göndərilənlər", numberOfAyahs: 50, revelationType: "Meccan" },
  { number: 78, name: "النبأ", englishName: "An-Naba", englishNameTranslation: "Böyük xəbər", numberOfAyahs: 40, revelationType: "Meccan" },
  { number: 79, name: "النازعات", englishName: "An-Nazi'at", englishNameTranslation: "Can alanlar", numberOfAyahs: 46, revelationType: "Meccan" },
  { number: 80, name: "عبس", englishName: "'Abasa", englishNameTranslation: "Üzünü turşutdu", numberOfAyahs: 42, revelationType: "Meccan" },
  { number: 81, name: "التكوير", englishName: "At-Takwir", englishNameTranslation: "Qatlanma", numberOfAyahs: 29, revelationType: "Meccan" },
  { number: 82, name: "الإنفطار", englishName: "Al-Infitar", englishNameTranslation: "Parçalanma", numberOfAyahs: 19, revelationType: "Meccan" },
  { number: 83, name: "المطففين", englishName: "Al-Mutaffifin", englishNameTranslation: "Çəkidə aldadalar", numberOfAyahs: 36, revelationType: "Meccan" },
  { number: 84, name: "الإنشقاق", englishName: "Al-Inshiqaq", englishNameTranslation: "Yarılma", numberOfAyahs: 25, revelationType: "Meccan" },
  { number: 85, name: "البروج", englishName: "Al-Buruj", englishNameTranslation: "Bürclər", numberOfAyahs: 22, revelationType: "Meccan" },
  { number: 86, name: "الطارق", englishName: "At-Tariq", englishNameTranslation: "Gecə yolçusu", numberOfAyahs: 17, revelationType: "Meccan" },
  { number: 87, name: "الأعلى", englishName: "Al-A'la", englishNameTranslation: "Ən uca olan", numberOfAyahs: 19, revelationType: "Meccan" },
  { number: 88, name: "الغاشية", englishName: "Al-Ghashiyah", englishNameTranslation: "Qaplayan xəbər", numberOfAyahs: 26, revelationType: "Meccan" },
  { number: 89, name: "الفجر", englishName: "Al-Fajr", englishNameTranslation: "Dan yeri", numberOfAyahs: 30, revelationType: "Meccan" },
  { number: 90, name: "البلد", englishName: "Al-Balad", englishNameTranslation: "Şəhər", numberOfAyahs: 20, revelationType: "Meccan" },
  { number: 91, name: "الشمس", englishName: "Ash-Shams", englishNameTranslation: "Günəş", numberOfAyahs: 15, revelationType: "Meccan" },
  { number: 92, name: "الليل", englishName: "Al-Layl", englishNameTranslation: "Gecə", numberOfAyahs: 21, revelationType: "Meccan" },
  { number: 93, name: "الضحى", englishName: "Ad-Duha", englishNameTranslation: "Puşlu vaxtı", numberOfAyahs: 11, revelationType: "Meccan" },
  { number: 94, name: "الشرح", englishName: "Ash-Sharh", englishNameTranslation: "Açılma (Genişlənmə)", numberOfAyahs: 8, revelationType: "Meccan" },
  { number: 95, name: "التين", englishName: "At-Tin", englishNameTranslation: "Əncir", numberOfAyahs: 8, revelationType: "Meccan" },
  { number: 96, name: "العلق", englishName: "Al-'Alaq", englishNameTranslation: "Lextə qan", numberOfAyahs: 19, revelationType: "Meccan" },
  { number: 97, name: "القدر", englishName: "Al-Qadr", englishNameTranslation: "Qədr gecəsi", numberOfAyahs: 5, revelationType: "Meccan" },
  { number: 98, name: "البينة", englishName: "Al-Bayyinah", englishNameTranslation: "Aydın dəlil", numberOfAyahs: 8, revelationType: "Medinan" },
  { number: 99, name: "Zalzalah", englishName: "Az-Zalzalah", englishNameTranslation: "Zəlzələ", numberOfAyahs: 8, revelationType: "Medinan" },
  { number: 100, name: "العاديات", englishName: "Al-'Adiyat", englishNameTranslation: "Çapan atlar", numberOfAyahs: 11, revelationType: "Meccan" },
  { number: 101, name: "القارعة", englishName: "Al-Qari'ah", englishNameTranslation: "Qulaqbatıran səslər", numberOfAyahs: 11, revelationType: "Meccan" },
  { number: 102, name: "التكاثر", englishName: "At-Takathur", englishNameTranslation: "Çoxaltmaq həvəsi", numberOfAyahs: 8, revelationType: "Meccan" },
  { number: 103, name: "العصر", englishName: "Al-'Asr", englishNameTranslation: "Əsr (Zaman)", numberOfAyahs: 3, revelationType: "Meccan" },
  { number: 104, name: "الهمزة", englishName: "Al-Humazah", englishNameTranslation: "Qeybətçilər", numberOfAyahs: 9, revelationType: "Meccan" },
  { number: 105, name: "الفيل", englishName: "Al-Fil", englishNameTranslation: "Fil", numberOfAyahs: 5, revelationType: "Meccan" },
  { number: 106, name: "قريش", englishName: "Quraysh", englishNameTranslation: "Qureyş tayfası", numberOfAyahs: 4, revelationType: "Meccan" },
  { number: 107, name: "الماعون", englishName: "Al-Ma'un", englishNameTranslation: "Xırda ehtiyaclar", numberOfAyahs: 7, revelationType: "Meccan" },
  { number: 108, name: "الكوثر", englishName: "Al-Kawthar", englishNameTranslation: "Kəvsər çayı", numberOfAyahs: 3, revelationType: "Meccan" },
  { number: 109, name: "الكافرون", englishName: "Al-Kafirun", englishNameTranslation: "Kafirər", numberOfAyahs: 6, revelationType: "Meccan" },
  { number: 110, name: "النصر", englishName: "An-Nasr", englishNameTranslation: "Kömək (Qələbə)", numberOfAyahs: 3, revelationType: "Medinan" },
  { number: 111, name: "المسد", englishName: "Al-Masad", englishNameTranslation: "Xurma lifləri", numberOfAyahs: 5, revelationType: "Meccan" },
  { number: 112, name: "الإخلاص", englishName: "Al-Ikhlas", englishNameTranslation: "İxlas (Təmiz əqidə)", numberOfAyahs: 4, revelationType: "Meccan" },
  { number: 113, name: "الفلق", englishName: "Al-Falaq", englishNameTranslation: "Sübh çağı", numberOfAyahs: 5, revelationType: "Meccan" },
  { number: 114, name: "الناس", englishName: "An-Nas", englishNameTranslation: "İnsanlar", numberOfAyahs: 6, revelationType: "Meccan" },
];

export const Quran: React.FC<QuranProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'player' | 'memorize' | 'my_hifz'>('player');
  const [selectedSurahNumber, setSelectedSurahNumber] = useState<number>(1);
  const [selectedReciter, setSelectedReciter] = useState<string>('ar.alafasy');
  const [selectedTranslation, setSelectedTranslation] = useState<string>('az.mammadaliyev');
  
  const [ayahs, setAyahs] = useState<AyahData[]>([]);
  const [loadingAyahs, setLoadingAyahs] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Audio playback state
  const [currentAyahIndex, setCurrentAyahIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  // Memorization (Hifz) settings
  const [repeatSetting, setRepeatSetting] = useState<number>(1); // repeat each ayah N times
  const [repeatCountCurrent, setRepeatCountCurrent] = useState<number>(0); // times current ayah repeated so far
  const [pauseIntervalSec, setPauseIntervalSec] = useState<number>(0); // pause between repeats for user to recite
  const [useRange, setUseRange] = useState<boolean>(false);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(7);
  const [textMode, setTextMode] = useState<'visible' | 'blur' | 'hidden'>('visible');
  const [revealedAyahs, setRevealedAyahs] = useState<Record<number, boolean>>({});

  // Memorization progress state from Firestore
  const [memorizedSurahs, setMemorizedSurahs] = useState<Record<number, boolean>>({});
  const [memorizedAyahsMap, setMemorizedAyahsMap] = useState<Record<string, boolean>>({});
  const [savingHifz, setSavingHifz] = useState<boolean>(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAyahRef = useRef<HTMLDivElement | null>(null);

  // Fetch Hifz Progress from Firestore
  useEffect(() => {
    if (!user?.uid) return;
    const userHifzRef = doc(db, 'user_hifz', user.uid);
    const unsub = onSnapshot(userHifzRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMemorizedSurahs(data.memorizedSurahs || {});
        setMemorizedAyahsMap(data.memorizedAyahsMap || {});
      }
    }, (err) => {
      console.warn("Hifz sync note:", err);
    });
    return () => unsub();
  }, [user?.uid]);

  // Load Surah Ayahs from API
  useEffect(() => {
    let isMounted = true;
    const fetchSurahData = async () => {
      setLoadingAyahs(true);
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }

      try {
        // Fetch audio reciter edition + translation edition in a single request
        const url = `https://api.alquran.cloud/v1/surah/${selectedSurahNumber}/editions/${selectedReciter},${selectedTranslation}`;
        const response = await fetch(url);
        const json = await response.json();

        if (isMounted && json.code === 200 && json.data && json.data.length >= 2) {
          const audioEdition = json.data[0];
          const translationEdition = json.data[1];

          const combinedAyahs: AyahData[] = audioEdition.ayahs.map((a: any, idx: number) => ({
            numberInSurah: a.numberInSurah,
            text: a.text,
            audio: a.audio,
            translationText: translationEdition.ayahs[idx]?.text || ''
          }));

          setAyahs(combinedAyahs);
          setCurrentAyahIndex(0);
          setRepeatCountCurrent(0);
          setRangeStart(1);
          setRangeEnd(combinedAyahs.length);
        }
      } catch (err) {
        console.error("Failed to load Quran surah:", err);
        setToast({ visible: true, message: "Sura məlumatı yüklənərkən xəta baş verdi.", type: 'error' });
      } finally {
        if (isMounted) setLoadingAyahs(false);
      }
    };

    fetchSurahData();

    return () => { isMounted = false; };
  }, [selectedSurahNumber, selectedReciter, selectedTranslation]);

  // Update audio speed and volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [playbackSpeed, volume, isMuted]);

  // Handle current Ayah changes or play/pause trigger
  useEffect(() => {
    if (!isPlaying || loadingAyahs || ayahs.length === 0) return;

    const currentAyah = ayahs[currentAyahIndex];
    if (!currentAyah || !currentAyah.audio) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(currentAyah.audio);
    } else {
      audioRef.current.src = currentAyah.audio;
    }

    audioRef.current.playbackRate = playbackSpeed;
    audioRef.current.volume = isMuted ? 0 : volume;

    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn("Audio autoplay prevented:", e);
        setIsPlaying(false);
      });
    }

    // Scroll active Ayah into view
    if (activeAyahRef.current) {
      activeAyahRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentAyahIndex, isPlaying, loadingAyahs]);

  // Handle audio ended event (Repeat / Next Ayah logic)
  const handleAudioEnded = () => {
    // Check repeat logic
    if (repeatSetting > 1 && repeatCountCurrent + 1 < repeatSetting) {
      setRepeatCountCurrent(prev => prev + 1);
      
      if (pauseIntervalSec > 0) {
        setIsPlaying(false);
        setTimeout(() => {
          setIsPlaying(true);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.warn(e));
          }
        }, pauseIntervalSec * 1000);
      } else {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.warn(e));
        }
      }
      return;
    }

    // Reset repeat counter for next verse
    setRepeatCountCurrent(0);

    // Range loop logic
    const minAyahIdx = useRange ? Math.max(0, rangeStart - 1) : 0;
    const maxAyahIdx = useRange ? Math.min(ayahs.length - 1, rangeEnd - 1) : ayahs.length - 1;

    if (currentAyahIndex < maxAyahIdx) {
      setCurrentAyahIndex(prev => prev + 1);
    } else {
      // Reached end of range or surah
      if (useRange) {
        // Loop back to rangeStart
        setCurrentAyahIndex(minAyahIdx);
      } else {
        // End of Surah
        setIsPlaying(false);
      }
    }
  };

  const togglePlayPause = () => {
    if (loadingAyahs || ayahs.length === 0) return;

    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.warn(e));
      }
    }
  };

  const handleNextAyah = () => {
    setRepeatCountCurrent(0);
    if (currentAyahIndex < ayahs.length - 1) {
      setCurrentAyahIndex(prev => prev + 1);
    }
  };

  const handlePrevAyah = () => {
    setRepeatCountCurrent(0);
    if (currentAyahIndex > 0) {
      setCurrentAyahIndex(prev => prev - 1);
    }
  };

  // Toggle memorized status for Surah or individual Ayah
  const toggleSurahHifz = async (surahNum: number) => {
    const updated = { ...memorizedSurahs, [surahNum]: !memorizedSurahs[surahNum] };
    setMemorizedSurahs(updated);
    setToast({ 
      visible: true, 
      message: updated[surahNum] ? `Sura ${surahNum} hifz siyahısına əlavə olundu!` : `Sura ${surahNum} hifz siyahısından çıxarıldı.`, 
      type: 'success' 
    });

    try {
      await setDoc(doc(db, 'user_hifz', user.uid), {
        userId: user.uid,
        userName: user.name,
        memorizedSurahs: updated,
        memorizedAyahsMap,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Save Hifz error:", e);
    }
  };

  const toggleAyahHifz = async (surahNum: number, ayahNum: number) => {
    const key = `${surahNum}:${ayahNum}`;
    const updatedMap = { ...memorizedAyahsMap, [key]: !memorizedAyahsMap[key] };
    setMemorizedAyahsMap(updatedMap);

    try {
      await setDoc(doc(db, 'user_hifz', user.uid), {
        userId: user.uid,
        memorizedAyahsMap: updatedMap,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Save Ayah Hifz error:", e);
    }
  };

  const currentSurahMeta = ALL_SURAHS.find(s => s.number === selectedSurahNumber) || ALL_SURAHS[0];

  const filteredSurahs = ALL_SURAHS.filter(s => 
    s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.englishNameTranslation.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.number.toString().includes(searchQuery) ||
    s.name.includes(searchQuery)
  );

  const popularSurahs = [1, 36, 67, 18, 55, 56, 112, 113, 114];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-28">
      <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />

      {/* Hidden audio element with onEnded listener */}
      <audio 
        ref={audioRef} 
        onEnded={handleAudioEnded}
        className="hidden"
      />

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-indigo-700 text-white p-6 md:p-8 shadow-md border border-indigo-600/30">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none text-9xl font-arabic">
          القرآن
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-indigo-900/50 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-semibold text-indigo-200 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              Rəqəmsal Mədrəsə
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white flex items-center gap-3">
              Qurani-Kərim Audio və Əzbərləmə
            </h1>
            <p className="text-indigo-100 text-xs sm:text-sm max-w-xl font-medium leading-relaxed">
              114 surə, məşhur qari səsləri, Azərbaycan və rus dillərində tərcümələr və xüsusi hifz (əzbərləmə) təkrar alətləri.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex flex-wrap items-center gap-2 bg-indigo-900/60 p-1.5 rounded-2xl border border-indigo-500/20 backdrop-blur-md">
            <button
              onClick={() => setActiveTab('player')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'player'
                  ? 'bg-white text-indigo-900 shadow-md scale-[1.02]'
                  : 'text-indigo-100 hover:bg-white/10'
              }`}
            >
              <Headphones className="w-4 h-4" />
              Dinləmə
            </button>
            <button
              onClick={() => setActiveTab('memorize')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'memorize'
                  ? 'bg-amber-400 text-slate-950 shadow-md scale-[1.02]'
                  : 'text-indigo-100 hover:bg-white/10'
              }`}
            >
              <Brain className="w-4 h-4 text-slate-900" />
              Əzbərləmə Məşqi
            </button>
            <button
              onClick={() => setActiveTab('my_hifz')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'my_hifz'
                  ? 'bg-indigo-400 text-slate-950 shadow-md scale-[1.02]'
                  : 'text-indigo-100 hover:bg-white/10'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              Hifz Tərəqqisi
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Sidebar: Surah List & Quick Filters */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-4 space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Surə adı, nömrəsi və ya mənası..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-xs font-medium focus:outline-none focus:border-brand"
              />
            </div>

            {/* Popular Surah Quick Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted">Tez keçid:</span>
              <div className="flex flex-wrap gap-1.5">
                {popularSurahs.map(num => {
                  const s = ALL_SURAHS.find(x => x.number === num);
                  if (!s) return null;
                  return (
                    <button
                      key={num}
                      onClick={() => setSelectedSurahNumber(num)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all ${
                        selectedSurahNumber === num
                          ? 'bg-brand text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {s.englishName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Surah List Scroll Container */}
            <div className="max-h-[420px] lg:max-h-[580px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {filteredSurahs.map((surah) => {
                const isSelected = surah.number === selectedSurahNumber;
                const isMemorized = memorizedSurahs[surah.number];

                return (
                  <button
                    key={surah.number}
                    onClick={() => setSelectedSurahNumber(surah.number)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between group ${
                      isSelected
                        ? 'bg-brand/10 border-brand text-brand font-semibold shadow-sm'
                        : 'bg-surface border-border hover:border-brand/40 text-text'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold ${
                        isSelected ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {surah.number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold">{surah.englishName}</h4>
                          {isMemorized && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 fill-indigo-100" />}
                        </div>
                        <p className="text-[11px] text-muted">{surah.englishNameTranslation} • {surah.numberOfAyahs} ayə</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-arabic text-base font-semibold text-slate-800">{surah.name}</span>
                      <p className="text-[11px] text-muted capitalize">{surah.revelationType === 'Meccan' ? 'Məkkə' : 'Mədinə'}</p>
                    </div>
                  </button>
                );
              })}

              {filteredSurahs.length === 0 && (
                <div className="p-8 text-center text-muted text-xs font-medium">
                  Heç bir surə tapılmadı.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Area: Main Player / Memorization Tool */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Controls Bar: Reciter & Translation Selection */}
          <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted mb-1.5">
                Qari (Səs):
              </label>
              <select
                value={selectedReciter}
                onChange={(e) => setSelectedReciter(e.target.value)}
                className="w-full p-2.5 bg-background border border-border rounded-xl text-xs font-semibold focus:outline-none focus:border-brand"
              >
                {RECITERS.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.style})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted mb-1.5">
                Mətn Tərcüməsi:
              </label>
              <select
                value={selectedTranslation}
                onChange={(e) => setSelectedTranslation(e.target.value)}
                className="w-full p-2.5 bg-background border border-border rounded-xl text-xs font-semibold focus:outline-none focus:border-brand"
              >
                {TRANSLATIONS.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Memorization Mode Settings Box (If Memorization tab active) */}
          {activeTab === 'memorize' && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-900">Əzbərləmə Vərdiş Tənzimləmələri</h3>
                </div>
                <span className="text-[11px] font-semibold bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full">Hifz Rejimi</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Repeat count per Ayah */}
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">
                    Hər ayəni təkrar et:
                  </label>
                  <select
                    value={repeatSetting}
                    onChange={(e) => setRepeatSetting(Number(e.target.value))}
                    className="w-full p-2 bg-background border border-border rounded-xl text-xs font-semibold"
                  >
                    <option value={1}>1 dəfə (Standart)</option>
                    <option value={2}>2 dəfə təkrar</option>
                    <option value={3}>3 dəfə təkrar</option>
                    <option value={5}>5 dəfə təkrar</option>
                    <option value={10}>10 dəfə təkrar</option>
                  </select>
                </div>

                {/* Pause between repeats */}
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">
                    Təkrarlar arası fasilə:
                  </label>
                  <select
                    value={pauseIntervalSec}
                    onChange={(e) => setPauseIntervalSec(Number(e.target.value))}
                    className="w-full p-2 bg-background border border-border rounded-xl text-xs font-semibold"
                  >
                    <option value={0}>0 saniyə (Fasilsəiz)</option>
                    <option value={2}>2 saniyə (Təkrar oxumaq üçün)</option>
                    <option value={3}>3 saniyə</option>
                    <option value={5}>5 saniyə</option>
                  </select>
                </div>

                {/* Text Visibility Mode */}
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">
                    Mətnin Görünüşü:
                  </label>
                  <select
                    value={textMode}
                    onChange={(e) => setTextMode(e.target.value as any)}
                    className="w-full p-2 bg-background border border-border rounded-xl text-xs font-semibold"
                  >
                    <option value="visible">Tam görünən mətn</option>
                    <option value="blur">Dumanlı (Üstünə kliklədikdə açılır)</option>
                    <option value="hidden">Tam gizli (Yalnız audio)</option>
                  </select>
                </div>
              </div>

              {/* Range Selector */}
              <div className="pt-2 border-t border-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-amber-950">
                  <input
                    type="checkbox"
                    checked={useRange}
                    onChange={(e) => setUseRange(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                  />
                  Konkret ayə aralığını dövrə al (Məsələn 1-ci ayədən 5-cə kimi)
                </label>

                {useRange && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted">Ayə:</span>
                    <input
                      type="number"
                      min={1}
                      max={ayahs.length || 1}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Math.max(1, Number(e.target.value)))}
                      className="w-14 p-1.5 bg-background border border-border rounded-xl text-center text-xs font-semibold"
                    />
                    <span className="text-xs font-semibold text-muted">-dən</span>
                    <input
                      type="number"
                      min={rangeStart}
                      max={ayahs.length || 1}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Math.min(ayahs.length, Math.max(rangeStart, Number(e.target.value))))}
                      className="w-14 p-1.5 bg-background border border-border rounded-xl text-center text-xs font-semibold"
                    />
                    <span className="text-xs font-semibold text-muted">-dək</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: HIFZ PROGRESS LIST */}
          {activeTab === 'my_hifz' ? (
            <div className="card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-text">Mənim Hifz Uğurlarım</h3>
                  <p className="text-muted text-xs">Əzbərlədiyiniz surələr və ayələrin siyahısı</p>
                </div>
                <div className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-3 py-1 rounded-full">
                  {Object.values(memorizedSurahs).filter(Boolean).length} / 114 Surə Əzbərlənib
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {ALL_SURAHS.map((surah) => {
                  const isDone = memorizedSurahs[surah.number];

                  return (
                    <div
                      key={surah.number}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        isDone
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-950 shadow-sm'
                          : 'bg-surface border-border text-text'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-semibold ${
                          isDone ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {surah.number}
                        </span>
                        <div>
                          <h4 className="text-xs font-semibold">{surah.englishName}</h4>
                          <p className="text-[11px] text-muted">{surah.numberOfAyahs} ayə</p>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleSurahHifz(surah.number)}
                        className={`p-2 rounded-xl transition-transform ${
                          isDone
                            ? 'bg-indigo-600 text-white shadow'
                            : 'bg-slate-100 text-slate-400 hover:text-indigo-600'
                        }`}
                        title={isDone ? 'Tamamlanıb kənarlaşdır' : 'Əzbər kimi işarələ'}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* AYAH LIST & AUDIO DISPLAY */
            <div className="card p-4 sm:p-6 space-y-6">
              
              {/* Surah Header Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-indigo-50 border border-indigo-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-xl">
                      Surə {currentSurahMeta.number}
                    </span>
                    <span className="text-xs font-semibold text-indigo-800 ">
                      {currentSurahMeta.revelationType === 'Meccan' ? 'Məkkə surəsi' : 'Mədinə surəsi'}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                    {currentSurahMeta.englishName} ({currentSurahMeta.englishNameTranslation})
                  </h2>
                  <p className="text-xs text-slate-600 font-medium">Cəmi {currentSurahMeta.numberOfAyahs} ayə</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleSurahHifz(currentSurahMeta.number)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                      memorizedSurahs[currentSurahMeta.number]
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {memorizedSurahs[currentSurahMeta.number] ? 'Surə Əzbərlənib' : 'Surəni Hifz Etmişəm'}
                  </button>

                  <span className="font-arabic text-3xl font-semibold text-indigo-900 pr-2">
                    {currentSurahMeta.name}
                  </span>
                </div>
              </div>

              {/* Bismillah Header if not Surah Tawbah */}
              {selectedSurahNumber !== 9 && (
                <div className="text-center py-3 border-b border-border">
                  <span className="font-arabic text-2xl text-slate-800 font-semibold">
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                  </span>
                </div>
              )}

              {/* Loading State */}
              {loadingAyahs ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-brand animate-spin" />
                  <p className="text-xs font-semibold text-muted ">Surə audiolayihəsi yüklənir...</p>
                </div>
              ) : (
                /* Ayahs View */
                <div className="space-y-4">
                  {ayahs.map((ayah, idx) => {
                    const isActive = idx === currentAyahIndex;
                    const ayahHifzKey = `${selectedSurahNumber}:${ayah.numberInSurah}`;
                    const isAyahMemorized = memorizedAyahsMap[ayahHifzKey];
                    const isRevealed = revealedAyahs[idx];

                    // Determine text visibility classes for memorization mode
                    let textVisibilityClass = "";
                    if (activeTab === 'memorize') {
                      if (textMode === 'hidden' && !isRevealed) textVisibilityClass = "opacity-0 select-none pointer-events-none";
                      if (textMode === 'blur' && !isRevealed) textVisibilityClass = "blur-md select-none transition-all";
                    }

                    return (
                      <div
                        key={ayah.numberInSurah}
                        ref={isActive ? activeAyahRef : null}
                        onClick={() => {
                          setCurrentAyahIndex(idx);
                          setRepeatCountCurrent(0);
                          if (!isPlaying) setIsPlaying(true);
                        }}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative group ${
                          isActive
                            ? 'bg-indigo-50/80 border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                            : 'bg-surface border-border hover:border-indigo-300'
                        }`}
                      >
                        {/* Ayah Header Bar */}
                        <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-xl text-xs font-semibold flex items-center justify-center ${
                              isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {ayah.numberInSurah}
                            </span>

                            {isActive && isPlaying && (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full animate-pulse">
                                <Volume2 className="w-3 h-3" />
                                Oxunur... {repeatSetting > 1 && `(${repeatCountCurrent + 1}/${repeatSetting})`}
                              </span>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {activeTab === 'memorize' && textMode !== 'visible' && (
                              <button
                                onClick={() => setRevealedAyahs(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                className="p-1.5 rounded-xl bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-semibold flex items-center gap-1"
                                title="Mətni göstər / gizlə"
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span className="text-[11px]">{isRevealed ? 'Gizlə' : 'Göstər'}</span>
                              </button>
                            )}

                            <button
                              onClick={() => toggleAyahHifz(selectedSurahNumber, ayah.numberInSurah)}
                              className={`p-1.5 rounded-xl transition-colors ${
                                isAyahMemorized ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-slate-400 hover:text-indigo-600'
                              }`}
                              title={isAyahMemorized ? 'Ayə əzbərlənib' : 'Ayəni əzbər kimi işarələ'}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${ayah.text}\n(${currentSurahMeta.englishName}, ${ayah.numberInSurah})`);
                                setToast({ visible: true, message: 'Ayə mətni kopyalandı!', type: 'success' });
                              }}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="Kopyala"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Arabic Ayah Text */}
                        <div className="text-right py-2 leading-loose">
                          <p className={`font-arabic text-2xl sm:text-3xl text-slate-900 font-semibold tracking-wide transition-all ${textVisibilityClass}`}>
                            {ayah.text} ۝
                          </p>
                        </div>

                        {/* Translation Text */}
                        {ayah.translationText && (
                          <div className="mt-2 pt-2 border-t border-border/30">
                            <p className={`text-xs text-slate-600 font-medium leading-relaxed ${textVisibilityClass}`}>
                              {ayah.translationText}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Floating Bottom Sticky Audio Player Bar */}
      {ayahs.length > 0 && activeTab !== 'my_hifz' && (
        <div className="fixed bottom-3 left-2 right-2 md:left-72 md:right-6 z-50">
          <div className="max-w-4xl mx-auto bg-slate-900/95 backdrop-blur-xl border border-slate-700 text-white p-3 sm:p-4 rounded-2xl shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Left: Current Ayah & Surah Meta */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shadow-md">
                {currentAyahIndex + 1}
              </div>
              <div className="truncate">
                <h4 className="text-xs font-semibold text-white truncate">
                  {currentSurahMeta.englishName} ({currentSurahMeta.name})
                </h4>
                <p className="text-[11px] text-indigo-300 font-medium">
                  Ayə {currentAyahIndex + 1} / {ayahs.length} • {RECITERS.find(r=>r.id===selectedReciter)?.name.split(' ')[0]}
                </p>
              </div>
            </div>

            {/* Center: Controls (Prev, Play/Pause, Next) */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevAyah}
                disabled={currentAyahIndex === 0}
                className="p-2.5 rounded-full hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
                title="Əvvəlki ayə"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlayPause}
                className="w-12 h-12 rounded-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 flex items-center justify-center font-semibold transition-all"
                title={isPlaying ? 'Pauza' : 'Oyna'}
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </button>

              <button
                onClick={handleNextAyah}
                disabled={currentAyahIndex === ayahs.length - 1}
                className="p-2.5 rounded-full hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
                title="Növbəti ayə"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Right: Speed & Volume Controls */}
            <div className="flex items-center gap-3">
              {/* Playback Speed selector */}
              <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-xl text-[11px] font-semibold">
                <span className="text-slate-400">Sürət:</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="bg-transparent text-indigo-400 font-semibold focus:outline-none cursor-pointer"
                >
                  <option value={0.75} className="bg-slate-900 text-white">0.75x</option>
                  <option value={1.0} className="bg-slate-900 text-white">1.0x</option>
                  <option value={1.25} className="bg-slate-900 text-white">1.25x</option>
                  <option value={1.5} className="bg-slate-900 text-white">1.5x</option>
                  <option value={2.0} className="bg-slate-900 text-white">2.0x</option>
                </select>
              </div>

              {/* Mute button */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                title={isMuted ? 'Səsi aç' : 'Səsi bağla'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
