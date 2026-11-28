/** Journal subjects (same ids as the electronic journal). */
export const SUBJECTS = [
  { id: 'arab-dili', name: 'Ərəb dili' },
  { id: 'tecvid', name: 'Təcvid' },
  { id: 'eqide', name: 'Əqidə' },
  { id: 'fiqh', name: 'Fiqh' },
  { id: 'hedis', name: 'Hədis' },
  { id: 'tefsir', name: 'Təfsir' },
  { id: 'exlaq', name: 'Əxlaq' },
  { id: 'sira', name: 'Sira' },
];

/** Suggested mark from the percentage: 90%+ → 5, 73%+ → 4, 53%+ → 3, otherwise 2 (27/22/16 of 30). */
export const suggestMark = (score: number, total: number): string => {
  const p = total > 0 ? score / total : 0;
  return p >= 0.9 ? '5' : p >= 0.73 ? '4' : p >= 0.53 ? '3' : '2';
};
