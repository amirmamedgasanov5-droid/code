import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Maximize2, X, Image as ImageIcon, Loader2, Info } from 'lucide-react';


export type SolverLang = 'az' | 'ru';

const STR: Record<SolverLang, Record<string, string>> = {
  az: {
    back: 'Geri', prev: 'Əvvəlki', next: 'Növbəti', fullscreen: 'Tam ekran', close: 'Bağla',
    correct: 'Düzgün cavab', wrong: 'Səhv cavab', recorded: 'Cavab qeyd olundu', task: 'Tapşırıq',
    placeholder: 'Ətraflı cavab verin', answer: 'Cavab ver', yourAnswer: 'Sizin cavab', rightAnswer: 'Düzgün cavab',
    note: 'Əlavə qeyd (könüllü)', yourAnswerTitle: 'Sizin cavabınız', notePh: 'Əlavə qeydləriniz varsa yazın', answerPh: 'Cavabınızı buraya yazın',
    addImage: 'Şəkil əlavə et (könüllü)', removeImage: 'Şəkli sil', save: 'Saxla və sonra davam et', saved: 'Qaralama saxlanıldı',
    needAll: 'Təhvil vermək üçün bütün tapşırıqlara cavab verin',
  },
  ru: {
    back: 'Назад', prev: 'Назад', next: 'Далее', fullscreen: 'На весь экран', close: 'Закрыть',
    correct: 'Верно', wrong: 'Неверно', recorded: 'Ответ принят', task: 'Задание',
    placeholder: 'Ответьте развёрнуто', answer: 'Ответить', yourAnswer: 'Ваш ответ', rightAnswer: 'Верный ответ',
    note: 'Дополнительная заметка (необязательно)', yourAnswerTitle: 'Ваш ответ', notePh: 'Если хотите, добавьте заметку', answerPh: 'Напишите ответ здесь',
    addImage: 'Добавить фото (необязательно)', removeImage: 'Удалить фото', save: 'Сохранить и продолжить позже', saved: 'Черновик сохранён',
    needAll: 'Чтобы сдать работу, ответьте на все задания',
  },
};

export interface SolverQuestion {
  id: string;
  text: string;
  type: 'choice' | 'written';
  options?: string[];
  /** Index of the correct option. Never shown before the student answers. */
  correctIndex?: number;
}

export interface SolverPayload {
  answers: { [questionId: string]: string | number };
  text: string;
  image: File | null;
}

interface TaskSolverProps {
  title: string;
  subtitle?: string;
  description?: string;
  images?: string[];
  questions: SolverQuestion[];
  /** Show optional free-text note + image upload (used for homework). */
  allowExtras?: boolean;
  /** For tasks without questions: one free-text answer is required. */
  requireText?: boolean;
  submitLabel?: string;
  draftKey: string;
  submitting?: boolean;
  /** Interface language; when onLangChange is given a language switch is shown. */
  lang?: SolverLang;
  onLangChange?: (l: SolverLang) => void;
  onBack: () => void;
  onSubmit: (payload: SolverPayload) => void | Promise<void>;
}

interface Draft {
  answers: { [id: string]: string | number };
  locked: string[];
  text: string;
}

const readDraft = (key: string): Draft => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { answers: {}, locked: [], text: '' };
};

export const TaskSolver: React.FC<TaskSolverProps> = ({
  title,
  subtitle,
  description,
  images = [],
  questions,
  allowExtras = false,
  requireText = false,
  submitLabel = 'İşi təhvil ver',
  draftKey,
  submitting = false,
  lang = 'ru',
  onLangChange,
  onBack,
  onSubmit,
}) => {
  const L = STR[lang];
  const initial = useMemo(() => readDraft(draftKey), [draftKey]);
  const [answers, setAnswers] = useState<{ [id: string]: string | number }>(initial.answers);
  const [locked, setLocked] = useState<string[]>(initial.locked);
  const [text, setText] = useState(initial.text);
  const [image, setImage] = useState<File | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, []);

  const persist = (next?: Partial<Draft>) => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ answers, locked, text, ...next }));
    } catch {}
  };

  const setAnswer = (id: string, value: string | number) => setAnswers(a => ({ ...a, [id]: value }));

  const lockQuestion = (id: string) => {
    const next = locked.includes(id) ? locked : [...locked, id];
    setLocked(next);
    persist({ locked: next });
  };

  const answeredCount = questions.filter(q => locked.includes(q.id)).length;
  const allAnswered = questions.length > 0 ? answeredCount === questions.length : false;
  const canSubmit = questions.length > 0 ? allAnswered : requireText ? text.trim().length > 0 : true;

  const handleSave = () => {
    persist();
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2200);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    await onSubmit({ answers, text, image });
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Title row */}
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="btn-secondary !px-4">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{L.back}</span>
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-text truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {onLangChange && (
          <div className="ml-auto flex rounded-full bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs">
            {([['az', 'Azərbaycanca'], ['ru', 'Русский']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onLangChange(id)}
                className={`px-3 py-1.5 rounded-full transition-colors ${lang === id ? 'bg-surface text-text shadow-sm font-medium' : 'text-muted hover:text-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {questions.length > 0 && (
          <div className={`${onLangChange ? '' : 'ml-auto '}flex items-center gap-3 min-w-[160px]`}>
            <div className="flex-1 h-1.5 rounded-full bg-brand-100 dark:bg-brand-950 overflow-hidden">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: `${(answeredCount / questions.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted whitespace-nowrap">{answeredCount} / {questions.length}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="card">
          <p className="text-sm text-text/80 leading-relaxed whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {/* Slides / image */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden border border-border bg-surface">
            <img
              src={images[imgIdx]}
              alt={title}
              className="w-full max-h-[520px] object-contain bg-neutral-50 dark:bg-neutral-900"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                  disabled={imgIdx === 0}
                  className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-text disabled:opacity-40 flex items-center justify-center"
                  aria-label={L.prev}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="h-11 px-5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm text-muted flex items-center">
                  {imgIdx + 1}/{images.length}
                </div>
                <button
                  onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))}
                  disabled={imgIdx === images.length - 1}
                  className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 disabled:opacity-40 flex items-center justify-center"
                  aria-label={L.next}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={() => setFullscreen(true)}
              className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center"
              aria-label={L.fullscreen}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {fullscreen && images.length > 0 && (
        <div className="fixed inset-0 z-[900] bg-black/90 flex items-center justify-center p-4" onClick={() => setFullscreen(false)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center" aria-label={L.close}>
            <X className="w-5 h-5" />
          </button>
          <img src={images[imgIdx]} alt={title} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
        </div>
      )}

      {/* Tasks */}
      {questions.map((q, idx) => {
        const isLocked = locked.includes(q.id);
        const value = answers[q.id];
        const isChoice = q.type === 'choice';
        const hasCorrect = isChoice && typeof q.correctIndex === 'number';
        const isCorrect = hasCorrect && value === q.correctIndex;
        const canAnswer = isChoice ? value !== undefined : String(value ?? '').trim().length > 0;

        return (
          <section key={q.id} className="card !p-6 space-y-5">
            {/* Result banner — only after the student has answered */}
            {isLocked && isChoice && hasCorrect && (
              <div
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                  isCorrect
                    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300'
                    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                }`}
              >
                {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{isCorrect ? L.correct : L.wrong}</span>
              </div>
            )}
            {isLocked && !isChoice && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
                <CheckCircle2 className="w-4 h-4" />
                <span>{L.recorded}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-muted">
              <span>{L.task} {idx + 1}</span>
              <span className="text-brand-600">*</span>
              <Info className="w-4 h-4 text-brand-500" />
            </div>

            <p className="text-lg text-text leading-snug">{q.text}</p>

            {isChoice ? (
              <div className="space-y-3">
                {q.options?.map((opt, oIdx) => {
                  const selected = value === oIdx;
                  const isRight = hasCorrect && oIdx === q.correctIndex;
                  let tone = 'bg-brand-50 dark:bg-brand-950/30 text-text';
                  if (isLocked && isRight) tone = 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200';
                  else if (isLocked && selected && !isRight) tone = 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200';
                  return (
                    <div key={oIdx} className="flex items-center gap-3">
                      <span className="w-6 text-sm text-muted text-right">{oIdx + 1}.</span>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => setAnswer(q.id, oIdx)}
                        className={`flex items-center gap-3 rounded-full pl-4 pr-6 py-3 text-sm transition-colors text-left ${tone} ${
                          !isLocked && !selected ? 'hover:bg-brand-100 dark:hover:bg-brand-950/60' : ''
                        } ${isLocked ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected ? 'border-brand-600' : 'border-brand-300'
                          }`}
                        >
                          {selected && <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
                        </span>
                        <span>{opt}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <textarea
                disabled={isLocked}
                value={String(value ?? '')}
                onChange={e => setAnswer(q.id, e.target.value)}
                rows={3}
                placeholder={L.placeholder}
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-neutral-50 dark:disabled:bg-neutral-900 resize-y"
              />
            )}

            {!isLocked ? (
              <button
                type="button"
                disabled={!canAnswer}
                onClick={() => lockQuestion(q.id)}
                className="btn-primary !px-8 !py-3 !text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {L.answer}
              </button>
            ) : (
              isChoice &&
              hasCorrect && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-stretch rounded-xl overflow-hidden border border-border text-sm">
                    <span className="bg-brand-700 text-white px-4 py-2.5">{L.yourAnswer}</span>
                    <span className="px-4 py-2.5 bg-surface text-text">{(value as number) + 1}</span>
                  </div>
                  <div className="flex items-stretch rounded-xl overflow-hidden border border-border text-sm">
                    <span className="bg-brand-700 text-white px-4 py-2.5">{L.rightAnswer}</span>
                    <span className="px-4 py-2.5 bg-surface text-text">{(q.correctIndex as number) + 1}</span>
                  </div>
                </div>
              )
            )}
          </section>
        );
      })}

      {/* Extras for homework */}
      {allowExtras && (
        <section className="card !p-6 space-y-4">
          <h3 className="text-sm font-semibold text-text">
            {questions.length > 0 ? L.note : L.yourAnswerTitle}
          </h3>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={questions.length > 0 ? 3 : 6}
            placeholder={questions.length > 0 ? L.notePh : L.answerPh}
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 resize-y"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <input type="file" accept="image/*" className="hidden" id="solver-image" onChange={e => setImage(e.target.files?.[0] || null)} />
            <label htmlFor="solver-image" className="btn-secondary cursor-pointer">
              <ImageIcon className="w-3.5 h-3.5 text-brand-600" />
              <span className="max-w-[240px] truncate">{image ? image.name : L.addImage}</span>
            </label>
            {image && (
              <button type="button" onClick={() => setImage(null)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label={L.removeImage}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* Actions */}
      <div className="card !p-4 flex flex-wrap items-center gap-3 sticky bottom-4 shadow-md">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="btn-primary !px-6 !py-3 !text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
        </button>
        <button type="button" onClick={handleSave} className="btn-secondary !px-6 !py-3 !text-sm">
          {L.save}
        </button>
        {savedNote && <span className="text-xs text-green-600">{L.saved}</span>}
        {!canSubmit && questions.length > 0 && (
          <span className="text-xs text-muted ml-auto">{L.needAll}</span>
        )}
      </div>
    </div>
  );
};
