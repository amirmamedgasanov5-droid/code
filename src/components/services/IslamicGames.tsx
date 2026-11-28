
import React, { useState, useEffect, useMemo } from 'react';
import { X, Trophy, Star, BookOpen, Timer, Users, Maximize2, Minimize2, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Edit2, Save, Bookmark } from 'lucide-react';
import { rtdb, auth, db } from '../../../firebase';
import { ref, onValue, set, push, onChildAdded, off, remove, serverTimestamp as rtdbTimestamp, runTransaction } from 'firebase/database';
import { collection, doc, setDoc, serverTimestamp as firestoreTimestamp, onSnapshot, query, orderBy, addDoc, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../../../types';

interface IslamicGamesProps {
  user: User;
  onClose: () => void;
}

interface QuizQuestion {
  id?: string;
  question: string;
  options: string[];
  correct: number;
}

const INITIAL_QUESTIONS: QuizQuestion[] = [
  {
    question: "İslamın neçə şərti var?",
    options: ["3", "5", "7", "10"],
    correct: 1
  },
  {
    question: "İlk vəhy hansı mağarada gəlmişdir?",
    options: ["Sevr", "Hira", "Uhud", "Bədr"],
    correct: 1
  },
  {
    question: "Quranın ilk surəsi hansıdır?",
    options: ["İxlas", "Bəqərə", "Fatihə", "Nas"],
    correct: 2
  },
  {
    question: "Peyğəmbərimizin (s.a.s) neçə övladı var idi?",
    options: ["4", "6", "7", "8"],
    correct: 2
  },
  {
    question: "Kəbə hansı şəhərdə yerləşir?",
    options: ["Mədinə", "Qüds", "Məkkə", "Ciddə"],
    correct: 2
  }
];

const SCRAMBLE_WORDS = [
  { word: "NAMAZ", hint: "İslamın ikinci şərti" },
  { word: "ORUC", hint: "Ramazan ayında tutulur" },
  { word: "QURAN", hint: "Müqəddəs kitabımız" },
  { word: "MƏKKƏ", hint: "Kəbə burada yerləşir" },
  { word: "CƏNNƏT", hint: "Möminlərin gedəcəyi yer" },
  { word: "ZƏKAT", hint: "Varlıların kasıblara verdiyi pay" },
  { word: "DUA", hint: "Allaha yalvarış" }
];

export const IslamicGames: React.FC<IslamicGamesProps> = ({ user, onClose }) => {
  const [activeGame, setActiveGame] = useState<'quiz' | 'scramble' | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [gameState, setGameState] = useState<any>(null);
  const [scores, setScores] = useState<{ [key: string]: { name: string, score: number } }>({});
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  // Scramble State
  const [scrambleIndex, setScrambleIndex] = useState(0);
  const [userGuess, setUserGuess] = useState("");
  const [scrambleMessage, setScrambleMessage] = useState("");
  
  // Question Manager State
  const [newQuestion, setNewQuestion] = useState<QuizQuestion>({
    question: '',
    options: ['', '', '', ''],
    correct: 0
  });

  const isTeacher = user.role === 'teacher';

  useEffect(() => {
    // Fetch questions from Firestore
    const q = query(collection(db, 'game_questions'), orderBy('createdAt', 'asc'));
    const unsubQuestions = onSnapshot(q, (snap) => {
      const fetchedQuestions = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizQuestion));
      setQuestions(fetchedQuestions);
      
      // Seed if empty
      if (fetchedQuestions.length === 0 && isTeacher) {
        seedQuestions();
      }
    });

    const gameRef = ref(rtdb, 'games/quiz');
    const scoresRef = ref(rtdb, 'games/quiz/scores');

    onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        set(gameRef, {
          status: 'waiting',
          startTime: null
        });
      } else {
        setGameState(data);
        // Reset local question index if game just started or was reset
        if (data.status === 'playing' && data.startTime) {
          // We can use startTime as a trigger to reset local state
        }
      }
      setLoading(false);
    });

    onValue(scoresRef, (snapshot) => {
      setScores(snapshot.val() || {});
    });

    return () => {
      unsubQuestions();
      off(gameRef);
      off(scoresRef);
    };
  }, [isTeacher]);

  useEffect(() => {
    if (gameState?.status === 'playing') {
      setCurrentQuestion(0);
    }
  }, [gameState?.startTime]);

  const seedQuestions = async () => {
    try {
      for (const q of INITIAL_QUESTIONS) {
        await addDoc(collection(db, 'game_questions'), {
          ...q,
          teacherId: user.uid,
          createdAt: firestoreTimestamp()
        });
      }
    } catch (error) {
      console.error('Seeding questions failed:', error);
    }
  };

  const addQuestion = async () => {
    if (!newQuestion.question || newQuestion.options.some(o => !o)) return;
    try {
      await addDoc(collection(db, 'game_questions'), {
        ...newQuestion,
        teacherId: user.uid,
        createdAt: firestoreTimestamp()
      });
      setNewQuestion({
        question: '',
        options: ['', '', '', ''],
        correct: 0
      });
    } catch (error) {
      console.error('Add question failed:', error);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (window.confirm('Bu sualı silmək istəyirsiniz?')) {
      try {
        await deleteDoc(doc(db, 'game_questions', id));
      } catch (error) {
        console.error('Delete question failed:', error);
      }
    }
  };

  const startGame = () => {
    if (questions.length === 0) {
      alert('Sual yoxdur! Zəhmət olmasa sual əlavə edin.');
      return;
    }
    set(ref(rtdb, 'games/quiz'), {
      status: 'playing',
      startTime: Date.now()
    });
  };

  const saveScoreToFirestore = async (finalScore: number) => {
    try {
      await setDoc(doc(db, 'game_scores', `${user.uid}_quiz`), {
        userId: user.uid,
        userName: user.name,
        gameType: 'quiz',
        score: finalScore,
        updatedAt: firestoreTimestamp()
      });
    } catch (error) {
      console.error('Firestore score save failed:', error);
    }
  };

  const submitAnswer = async (optionIndex: number) => {
    if (!gameState || gameState.status !== 'playing') return;
    
    const question = questions[currentQuestion];
    const isCorrect = optionIndex === question.correct;
    const scoreChange = isCorrect ? 10 : -10;

    const scoreRef = ref(rtdb, `games/quiz/scores/${user.uid}`);
    let newScore = 0;
    await runTransaction(scoreRef, (current) => {
      if (!current) {
        newScore = scoreChange;
        return { name: user.name, score: newScore };
      }
      newScore = (current.score || 0) + scoreChange;
      return { ...current, score: newScore };
    });

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      // For this user, the game is finished
      // But we don't change the global status to 'finished' yet, 
      // unless we want to end it for everyone.
      // Let's keep it playing so others can finish.
      // We can show a local "Finished" state.
      saveScoreToFirestore(newScore);
      setCurrentQuestion(questions.length); // Mark as finished locally
    }
  };

  const resetGame = () => {
    set(ref(rtdb, 'games/quiz'), {
      status: 'waiting',
      startTime: null
    });
    remove(ref(rtdb, 'games/quiz/scores'));
  };

  const submitScramble = (e: React.FormEvent) => {
    e.preventDefault();
    const correctWord = SCRAMBLE_WORDS[scrambleIndex].word;
    if (userGuess.toUpperCase() === correctWord) {
      setScrambleMessage("Düzdür! Maşallah! ");
      setTimeout(() => {
        setScrambleMessage("");
        setUserGuess("");
        if (scrambleIndex < SCRAMBLE_WORDS.length - 1) {
          setScrambleIndex(scrambleIndex + 1);
        } else {
          setScrambleIndex(0);
        }
      }, 1500);
    } else {
      setScrambleMessage("Səhvdir, yenidən yoxlayın. ");
      setTimeout(() => setScrambleMessage(""), 1500);
    }
  };

  const currentScrambledWord = useMemo(() => {
    return SCRAMBLE_WORDS[scrambleIndex].word.split('').sort(() => Math.random() - 0.5).join('');
  }, [scrambleIndex]);

  return (
    <div className={`fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center ${isFullScreen ? 'p-0' : 'p-4'}`}>
      <div className={`bg-white shadow-md flex flex-col overflow-hidden transition-all duration-300 ${isFullScreen ? 'w-full h-full rounded-0' : 'w-full max-w-4xl h-[80vh] rounded-2xl'}`}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-brand/10 rounded-full flex items-center justify-center text-brand">
              <Trophy className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-text text-xs">İslami Oyunlar</h3>
            {isTeacher && (
              <button 
                onClick={() => setShowManager(!showManager)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${showManager ? 'bg-brand text-white' : 'bg-white border border-border text-muted hover:border-brand/20'}`}
              >
                Sualları İdarə Et
              </button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-border text-muted transition-all"
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
          </div>
        ) : showManager && isTeacher ? (
          <div className="flex-1 p-8 overflow-y-auto bg-slate-50 space-y-8">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-border shadow-sm space-y-4">
                <h4 className="font-semibold text-text text-xs">Yeni Sual Əlavə Et</h4>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Sualı daxil edin..."
                    value={newQuestion.question}
                    onChange={(e) => setNewQuestion({...newQuestion, question: e.target.value})}
                    className="w-full p-3 rounded-2xl border border-border focus:border-brand outline-none transition-all"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {newQuestion.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input 
                          type="radio" 
                          name="correct" 
                          checked={newQuestion.correct === idx}
                          onChange={() => setNewQuestion({...newQuestion, correct: idx})}
                          className="accent-brand"
                        />
                        <input 
                          type="text" 
                          placeholder={`Variant ${idx + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...newQuestion.options];
                            newOpts[idx] = e.target.value;
                            setNewQuestion({...newQuestion, options: newOpts});
                          }}
                          className="flex-1 p-2 rounded-xl border border-border focus:border-brand outline-none text-sm transition-all"
                        />
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={addQuestion}
                    className="w-full bg-brand text-white py-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Əlavə Et</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-text text-xs">Mövcud Suallar ({questions.length})</h4>
                {questions.map((q) => (
                  <div key={q.id} className="bg-white p-4 rounded-2xl border border-border flex items-start justify-between group">
                    <div className="space-y-2">
                      <p className="font-semibold text-text text-sm">{q.question}</p>
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt, idx) => (
                          <span key={idx} className={`px-2 py-1 rounded text-[11px] font-semibold ${idx === q.correct ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-muted'}`}>
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button 
                      onClick={() => q.id && deleteQuestion(q.id)}
                      className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !activeGame ? (
          <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
            <button 
              onClick={() => setActiveGame('quiz')}
              className="group bg-white border-2 border-slate-100 p-8 rounded-2xl hover:border-brand/20 transition-all text-left space-y-4"
            >
              <div className="w-12 h-12 bg-brand/5 rounded-2xl flex items-center justify-center text-brand transition-transform">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-text text-lg">İslami Bilgi Yarışı</h4>
                <p className="text-muted text-sm mt-1">Dostlarınızla birlikdə biliklərinizi sınayın.</p>
              </div>
              <div className="flex items-center space-x-4 pt-4">
                <div className="flex items-center space-x-1 text-[11px] font-semibold text-muted">
                  <Users className="w-3 h-3" />
                  <span>Çoxnəfərli</span>
                </div>
                <div className="flex items-center space-x-1 text-[11px] font-semibold text-brand">
                  <Star className="w-3 h-3 fill-brand" />
                  <span>Populyar</span>
                </div>
              </div>
            </button>

            <button 
              onClick={() => setActiveGame('scramble')}
              className="group bg-white border-2 border-slate-100 p-8 rounded-2xl hover:border-brand/20 transition-all text-left space-y-4"
            >
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 transition-transform">
                <Bookmark className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-text text-lg">Hərfləri Tap</h4>
                <p className="text-muted text-sm mt-1">Qarışıq hərflərdən İslami sözləri üzə çıxarın.</p>
              </div>
              <div className="flex items-center space-x-4 pt-4">
                <div className="flex items-center space-x-1 text-[11px] font-semibold text-muted">
                  <Timer className="w-3 h-3" />
                  <span>Tək nəfərli</span>
                </div>
                <div className="flex items-center space-x-1 text-[11px] font-semibold text-orange-500">
                  <Bookmark className="w-3 h-3 fill-orange-500" />
                  <span>Yeni</span>
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Game Area */}
            <div className="flex-1 p-8 overflow-y-auto bg-white">
              <button 
                onClick={() => setActiveGame(null)}
                className="mb-6 text-[11px] font-semibold text-muted hover:text-brand flex items-center space-x-2"
              >
                <X className="w-3 h-3" />
                <span>Oyundan çıx</span>
              </button>

              {activeGame === 'quiz' ? (
                gameState?.status === 'waiting' ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-20 h-20 bg-brand/5 rounded-full flex items-center justify-center text-brand">
                      <Star className="w-10 h-10 fill-brand" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold text-text">Bilik Yarışına Hazırsınız?</h2>
                      <p className="text-muted max-w-xs mx-auto">Bütün iştirakçılar eyni sualları eyni anda görür.</p>
                    </div>
                    <button 
                      onClick={startGame}
                      className="bg-brand text-white px-8 py-3 rounded-2xl font-semibold text-xs transition-all"
                    >
                      Yarışı Başlat
                    </button>
                  </div>
                ) : gameState?.status === 'playing' && currentQuestion < questions.length ? (
                  <div className="max-w-2xl mx-auto space-y-8">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-brand">Sual {currentQuestion + 1} / {questions.length}</span>
                      <div className="flex items-center space-x-2 text-muted">
                        <Timer className="w-4 h-4" />
                        <span className="text-xs font-semibold">Canlı</span>
                      </div>
                    </div>

                    <h2 className="text-2xl font-semibold text-text leading-tight">
                      {questions[currentQuestion].question}
                    </h2>

                    <div className="grid grid-cols-1 gap-4">
                      {questions[currentQuestion].options.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => submitAnswer(idx)}
                          className="p-5 text-left rounded-2xl border-2 border-slate-100 hover:border-brand/20 hover:bg-brand/5 transition-all group flex items-center justify-between"
                        >
                          <span className="font-semibold text-text group-hover:text-brand transition-colors">{option}</span>
                          <div className="w-6 h-6 rounded-full border-2 border-slate-200 group-hover:border-brand transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (currentQuestion >= questions.length || gameState?.status === 'finished') ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center text-white">
                      <Trophy className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold text-text">Yarış Başa Çatdı!</h2>
                      <p className="text-muted">Bütün suallar cavablandırıldı.</p>
                    </div>
                    <button 
                      onClick={resetGame}
                      className="text-[11px] font-semibold text-brand hover:underline"
                    >
                      Yenidən başlat
                    </button>
                  </div>
                ) : null
              ) : activeGame === 'scramble' ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-8 max-w-sm mx-auto">
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-orange-500">Sözü Tap ({scrambleIndex + 1}/{SCRAMBLE_WORDS.length})</span>
                    <h2 className="text-4xl font-semibold text-text bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">{currentScrambledWord}</h2>
                    <p className="text-muted text-xs font-semibold pt-2">İpucu: {SCRAMBLE_WORDS[scrambleIndex].hint}</p>
                  </div>

                  <form onSubmit={submitScramble} className="w-full space-y-4">
                    <input 
                      type="text" 
                      value={userGuess}
                      onChange={(e) => setUserGuess(e.target.value)}
                      placeholder="Sözü daxil edin..."
                      className="w-full p-4 rounded-2xl border-2 border-slate-100 focus:border-orange-400 outline-none transition-all text-center font-semibold text-lg "
                      autoFocus
                    />
                    <button 
                      type="submit"
                      className="w-full bg-orange-500 text-white py-4 rounded-2xl font-semibold text-[11px] transition-all"
                    >
                      Yoxla
                    </button>
                  </form>

                  <AnimatePresence>
                    {scrambleMessage && (
                      <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`text-xs font-semibold ${scrambleMessage.includes('Düzdür') ? 'text-green-500' : 'text-red-500'}`}
                      >
                        {scrambleMessage}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              ) : null}
            </div>

            {/* Leaderboard */}
            <div className="w-full md:w-72 border-l border-border bg-slate-50 p-6 flex flex-col">
              <h4 className="text-[11px] font-semibold text-muted mb-6">Liderlər</h4>
              <div className="flex-1 space-y-4">
                {Object.values(scores).sort((a: any, b: any) => b.score - a.score).map((scoreData, idx) => {
                  const s = scoreData as { name: string, score: number };
                  return (
                    <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-border">
                      <div className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-xl flex items-center justify-center text-[11px] font-semibold ${idx === 0 ? 'bg-yellow-400 text-white' : 'bg-slate-100 text-muted'}`}>
                          {idx + 1}
                        </div>
                        <span className="text-xs font-semibold text-text truncate max-w-[100px]">{s.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-brand">{s.score}</span>
                    </div>
                  );
                })}
                {Object.keys(scores).length === 0 && (
                  <p className="text-center text-[11px] text-muted font-semibold py-8">Hələ xal yoxdur</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
