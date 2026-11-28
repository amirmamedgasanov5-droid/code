import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { 
  Trophy, Medal, Flame, Star, Bookmark, ChevronRight, 
  Shield, Crown, ArrowUp, ArrowDown, Users, CheckCircle2, 
  Info, Award, Zap, BookOpen, Layers, X, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RANKS, RankInfo, calculateStudentXP, getRankByXP, getRankProgress, StudentStats } from '../src/utils/rankService';
import { Toast } from '../components/Toast';

interface LeaguesProps {
  user: User;
}

export const Leagues: React.FC<LeaguesProps> = ({ user }) => {
  const [students, setStudents] = useState<StudentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeagueIndex, setSelectedLeagueIndex] = useState<number>(0);
  const [selectedRankModal, setSelectedRankModal] = useState<RankInfo | null>(null);
  const [selectedStudentModal, setSelectedStudentModal] = useState<StudentStats | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    let isMounted = true;

    const loadLeaderboard = async () => {
      try {
        setLoading(true);

        // 1. Fetch Students
        const userSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
        const userList = userSnap.docs.map(d => ({
          uid: d.id,
          name: d.data().name || 'Tələbə',
          username: d.data().username,
          className: d.data().className || d.data().class || '1-A',
          avatar: d.data().avatar || d.data().photoURL
        }));

        // 2. Fetch all Journal entries
        const journalSnap = await getDocs(collection(db, 'journal_v2'));
        const journalData = journalSnap.docs.map(d => d.data() as { studentId: string; mark: string; type?: string });

        // 3. Fetch Submissions
        const hwSnap = await getDocs(collection(db, 'submissions'));
        const hwData = hwSnap.docs.map(d => d.data() as { studentId: string; grade?: string; score?: number });

        // 4. Fetch Achievements
        const achSnap = await getDocs(collection(db, 'achievements'));
        const achData = achSnap.docs.map(d => d.data() as { studentId: string });

        // 5. Fetch Congratulations
        const congSnap = await getDocs(collection(db, 'congratulations'));
        const congData = congSnap.docs.map(d => d.data() as { studentId: string });

        if (!isMounted) return;

        // Compute stats for every student
        const statsList: StudentStats[] = userList.map((stu) => {
          const stuMarks = journalData.filter(j => j.studentId === stu.uid);
          const stuHw = hwData.filter(h => h.studentId === stu.uid);
          const stuAchCount = achData.filter(a => a.studentId === stu.uid).length;
          const stuCongCount = congData.filter(c => c.studentId === stu.uid).length;

          const { xp, fivesCount, foursCount, threesCount, twosCount, attendancePlusCount, attendanceMinusCount, gpa } = calculateStudentXP(
            stuMarks,
            stuHw,
            stuAchCount,
            stuCongCount
          );

          const rank = getRankByXP(xp);
          const totalGrades = stuMarks.length + stuHw.length;

          return {
            uid: stu.uid,
            name: stu.name,
            username: stu.username,
            className: stu.className,
            avatar: stu.avatar,
            xp,
            fivesCount,
            foursCount,
            threesCount,
            twosCount,
            attendancePlusCount,
            attendanceMinusCount,
            rank,
            league: rank,
            totalGrades,
            gpa,
            streakDays: Math.min(30, Math.max(1, Math.floor(attendancePlusCount / 2) + 1))
          };
        });

        // Sort descending by XP
        statsList.sort((a, b) => b.xp - a.xp);

        // Assign global positions
        statsList.forEach((st, idx) => {
          st.rankPosition = idx + 1;
        });

        setStudents(statsList);

        // Set current league tab to user's current league
        const currentUserStats = statsList.find(s => s.uid === user.uid);
        if (currentUserStats) {
          const userLeagueIdx = RANKS.findIndex(r => r.id === currentUserStats.rank.id);
          if (userLeagueIdx >= 0) {
            setSelectedLeagueIndex(userLeagueIdx);
          }
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Error loading leagues:", err);
        handleFirestoreError(err, OperationType.LIST, 'journal_v2');
        if (isMounted) setLoading(false);
      }
    };

    loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [user.uid]);

  const activeLeague = RANKS[selectedLeagueIndex] || RANKS[0];
  const currentUserStats = students.find(s => s.uid === user.uid) || {
    uid: user.uid,
    name: user.name || 'Tələbə',
    username: user.username,
    className: user.className || '1-A',
    xp: 0,
    fivesCount: 0,
    foursCount: 0,
    threesCount: 0,
    twosCount: 0,
    attendancePlusCount: 0,
    attendanceMinusCount: 0,
    rank: RANKS[0],
    league: RANKS[0],
    rankPosition: 1,
    totalGrades: 0,
    gpa: 5.0,
    streakDays: 1
  };

  const progress = getRankProgress(currentUserStats.xp);

  // Filter students in selected league or overall
  const leagueStudents = students.filter(s => s.rank.id === activeLeague.id);
  const displayStudents = leagueStudents.length > 0 ? leagueStudents : students;

  const top3 = displayStudents.slice(0, 3);
  const otherStudents = displayStudents.slice(3);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      {/* Header */}
      <div className="card flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
            <Trophy className="w-3.5 h-3.5" />
            <span>Akademik liqa və rütbə təsnifatı</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Liqalar və reytinq</h1>
          <p className="text-xs text-muted leading-relaxed">
            Qiymətlər, davamiyyət və tapşırıqlar əsasında hesablanan akademik XP göstəricisi.
          </p>
        </div>

        <div
          onClick={() => setSelectedRankModal(currentUserStats.rank)}
          className="w-full lg:w-72 p-4 rounded-xl bg-brand-50/70 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/50 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2 text-[11px] text-muted">
            <span>Cari pilləniz</span>
            <span className="tabular-nums">Səviyyə {currentUserStats.rank.level}</span>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">{currentUserStats.rank.name}</h2>
            <span className="text-xs tabular-nums font-medium text-brand-600 dark:text-brand-400">{currentUserStats.xp} XP</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-brand-100 dark:bg-brand-950 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress.progressPercent}%` }}
              className="h-full rounded-full bg-brand-600"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {progress.nextRank ? `Növbəti rütbəyə ${progress.remainingXp} XP qalıb` : 'Ən yüksək səviyyə'}
          </p>
        </div>
      </div>

      {/* Ranks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Rütbə pilləkəni</h2>
          <span className="text-[11px] text-muted">Detallar üçün seçin</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {RANKS.map((rk) => {
            const isUnlocked = currentUserStats.xp >= rk.minXp;
            const isCurrent = currentUserStats.rank.id === rk.id;
            return (
              <button
                key={rk.id}
                onClick={() => setSelectedRankModal(rk)}
                className={`p-3 rounded-xl text-center border transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : isUnlocked
                    ? 'bg-surface border-border text-text hover:border-brand-300'
                    : 'bg-surface border-border text-muted opacity-60'
                }`}
              >
                <span className={`block text-[11px] tabular-nums ${isCurrent ? 'text-brand-100' : 'text-muted'}`}>#{rk.level}</span>
                <span className="block text-xs font-semibold mt-0.5">{rk.name}</span>
                <span className={`block text-[11px] mt-0.5 ${isCurrent ? 'text-brand-100' : 'text-muted'}`}>{rk.minXp}+ XP</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* League tabs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-text">
            Həftəlik reytinq · <span className="text-brand-600 dark:text-brand-400">{activeLeague.leagueName}</span>
          </h2>
          <span className="text-[11px] text-muted">Yenilənmə: bazar günü 23:59</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {RANKS.map((lg, idx) => {
            const isSelected = selectedLeagueIndex === idx;
            const isUserLeague = currentUserStats.rank.id === lg.id;
            return (
              <button
                key={lg.id}
                onClick={() => setSelectedLeagueIndex(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-2 border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-surface border-border text-muted hover:text-text'
                }`}
              >
                <span>{lg.leagueName}</span>
                {isUserLeague && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
          <p className="text-xs text-muted">Reytinq hesablanır...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {top3.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {top3.map((st, i) => (
                <div
                  key={st.uid}
                  onClick={() => setSelectedStudentModal(st)}
                  className={`card card-hover cursor-pointer flex flex-col items-center text-center ${
                    i === 0 ? 'border-brand-300 dark:border-brand-700' : ''
                  }`}
                >
                  <span className="text-[11px] tabular-nums text-muted mb-2">#{i + 1}</span>
                  <div className="w-11 h-11 rounded-full bg-brand-50 dark:bg-brand-950/50 flex items-center justify-center text-sm font-semibold text-brand-700 dark:text-brand-300 overflow-hidden mb-2">
                    {st.avatar ? (
                      <img src={st.avatar} alt={st.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      st.name.charAt(0)
                    )}
                  </div>
                  <h3 className="font-semibold text-xs text-text">{st.name}</h3>
                  <span className="text-[11px] text-muted">{st.className}</span>
                  <span className="mt-2 text-xs tabular-nums font-medium text-brand-600 dark:text-brand-400">{st.xp} XP</span>
                </div>
              ))}
            </div>
          )}

          <div className="card !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border text-[11px] font-medium text-muted">
              <div className="flex items-center gap-4">
                <span className="w-6 text-center">#</span>
                <span>Tələbə</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="hidden sm:inline">Rütbə</span>
                <span className="w-20 text-right">XP</span>
              </div>
            </div>
            <div className="divide-y divide-border">
              {displayStudents.map((st, index) => {
                const isCurrentUser = st.uid === user.uid;
                return (
                  <div
                    key={st.uid}
                    onClick={() => setSelectedStudentModal(st)}
                    className={`flex items-center justify-between px-4 py-2.5 text-xs cursor-pointer transition-colors ${
                      isCurrentUser ? 'bg-brand-50/70 dark:bg-brand-950/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="w-6 text-center tabular-nums text-muted">{index + 1}</span>
                      <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-semibold text-text overflow-hidden shrink-0">
                        {st.avatar ? (
                          <img src={st.avatar} alt={st.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          st.name.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text truncate">{st.name}</span>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.5 rounded bg-brand-600 text-white text-[11px] font-medium">Siz</span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted block">
                          {st.className} {st.username ? `· @${st.username}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="hidden sm:inline text-muted">{st.rank.name}</span>
                      <span className="w-20 text-right tabular-nums font-medium text-text">{st.xp} XP</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rank Information Modal */}
      <AnimatePresence>
        {selectedRankModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 w-full max-w-sm rounded-2xl shadow-md overflow-hidden p-6 space-y-4 relative text-center"
            >
              <button
                onClick={() => setSelectedRankModal(null)}
                className="absolute top-3 right-3 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-12 h-12 mx-auto rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-2xl">
                {selectedRankModal.icon}
              </div>

              <div>
                <span className="text-[11px] tabular-nums text-neutral-400 block mb-0.5">
                  Səviyyə {selectedRankModal.level} • {selectedRankModal.leagueName}
                </span>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {selectedRankModal.name} Rütbəsi
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {selectedRankModal.title}
                </p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 rounded-2xl border border-neutral-200/60 dark:border-neutral-800 text-left space-y-1">
                <span className="text-[11px] font-medium text-neutral-400 block">Tələb olunan xal:</span>
                <span className="text-xs tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">
                  {selectedRankModal.minXp} - {selectedRankModal.maxXp === 999999 ? 'və daha çox' : `${selectedRankModal.maxXp} XP`}
                </span>
                <p className="text-xs text-neutral-500 pt-1 leading-relaxed">
                  {selectedRankModal.description}
                </p>
              </div>

              <div className="space-y-1.5 text-left">
                <span className="text-[11px] font-medium text-neutral-400 block">Rütbənin İmtiazları:</span>
                <div className="space-y-1">
                  {selectedRankModal.perks.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-950 p-2 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setSelectedRankModal(null)}
                className="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-xl text-xs transition-colors  cursor-pointer"
              >
                Bağla
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Student Details Preview Modal */}
      <AnimatePresence>
        {selectedStudentModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 w-full max-w-md rounded-2xl shadow-md overflow-hidden p-6 space-y-4 relative"
            >
              <button
                onClick={() => setSelectedStudentModal(null)}
                className="absolute top-3 right-3 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Student Header */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-base font-semibold text-neutral-800 dark:text-neutral-200">
                  {selectedStudentModal.avatar ? (
                    <img src={selectedStudentModal.avatar} alt={selectedStudentModal.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    selectedStudentModal.name.charAt(0)
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{selectedStudentModal.name}</h3>
                  <span className="text-xs text-neutral-400 block">{selectedStudentModal.className} {selectedStudentModal.username ? `• @${selectedStudentModal.username}` : ''}</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[11px] font-medium">
                      {selectedStudentModal.rank.icon} {selectedStudentModal.rank.name}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 text-[11px] tabular-nums font-medium">
                      {selectedStudentModal.xp} XP
                    </span>
                  </div>
                </div>
              </div>

              {/* Academic Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200/70 dark:border-neutral-800 text-center">
                  <span className="text-[11px] font-medium text-neutral-400 block">Orta Bal</span>
                  <span className="text-sm tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">{selectedStudentModal.gpa}</span>
                </div>
                <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200/70 dark:border-neutral-800 text-center">
                  <span className="text-[11px] font-medium text-neutral-400 block">"5"-liklər</span>
                  <span className="text-sm tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">{selectedStudentModal.fivesCount}</span>
                </div>
                <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200/70 dark:border-neutral-800 text-center">
                  <span className="text-[11px] font-medium text-neutral-400 block">Davamiyyət</span>
                  <span className="text-sm tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">+{selectedStudentModal.attendancePlusCount}</span>
                </div>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 rounded-2xl border border-neutral-200/70 dark:border-neutral-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Liqa Statusu:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">{selectedStudentModal.league.leagueName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Sıralama:</span>
                  <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200">{selectedStudentModal.rankPosition}-ci yer</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Aktiv Dərs Seriyası:</span>
                  <span className="tabular-nums text-neutral-700 dark:text-neutral-300">{selectedStudentModal.streakDays} gün</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentModal(null)}
                className="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-xl text-xs transition-colors  cursor-pointer"
              >
                Bağla
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
