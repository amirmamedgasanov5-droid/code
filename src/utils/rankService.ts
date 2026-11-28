import { User } from '../../types';

export interface RankInfo {
  id: number;
  key: string;
  name: string; // Azerbaijani name
  title: string; // Level title
  leagueName: string; // League name
  level: number;
  minXp: number;
  maxXp: number;
  color: string;
  badgeBg: string;
  border3d: string;
  glowColor: string;
  icon: string;
  gemIcon: string;
  description: string;
  perks: string[];
}

export const RANKS: RankInfo[] = [
  {
    id: 1,
    key: 'bronze',
    name: 'Bürünc',
    title: 'Mübtədi (Başlanğıc)',
    leagueName: 'Bürünc Liqa',
    level: 1,
    minXp: 0,
    maxXp: 299,
    color: '#D97706',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '1',
    gemIcon: '',
    description: 'Mədrəsə təhsilinə yeni qədəm basmış əzmkar və həvəsli tələbə.',
    perks: [
      'Bürünc Liqada həftəlik yarışmaq',
      'Gündəlik dərslərdə qiymətlər almaq',
      'İlk nailiyyət nişanlarını qazanmaq'
    ]
  },
  {
    id: 2,
    key: 'silver',
    name: 'Gümüş',
    title: 'Fəal Tələbə',
    leagueName: 'Gümüş Liqa',
    level: 2,
    minXp: 300,
    maxXp: 699,
    color: '#94A3B8',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '2',
    gemIcon: '',
    description: 'Dərslərə müntəzəm qatılan və ilk sabit nailiyyətlərini qazanan tələbə.',
    perks: [
      'Gümüş Liqada iştirak hüququ',
      'Profil üçün gümüş çərçivə',
      'Gümüş status nişanı'
    ]
  },
  {
    id: 3,
    key: 'gold',
    name: 'Qızıl',
    title: 'Çalışqan (Zəhmətkeş)',
    leagueName: 'Qızıl Liqa',
    level: 3,
    minXp: 700,
    maxXp: 1299,
    color: '#F59E0B',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '3',
    gemIcon: '',
    description: 'Yüksək qiymətlər toplayan və intizamlı olan çalışqan tələbə.',
    perks: [
      'Qızıl Liqanın xüsusi rütbəsi',
      'Müəllimlərin tərifnamə siyahısına düşmək',
      'Həftəlik fərqlənmə medalı'
    ]
  },
  {
    id: 4,
    key: 'emerald',
    name: 'Zümrüd',
    title: 'Bilici (Kəşfiyyatçı)',
    leagueName: 'Zümrüd Liqa',
    level: 4,
    minXp: 1300,
    maxXp: 2199,
    color: '#10B981',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '4',
    gemIcon: '',
    description: 'Dərsləri dərindən qavrayan, suallara parlaq cavab verən bilici.',
    perks: [
      'Zümrüd Liqası fəxri üzvü',
      'Təcvid və Ərəb dili üzrə kəşfiyyatçı statusu',
      'Xüsusi Zümrüd animasiyalı profili'
    ]
  },
  {
    id: 5,
    key: 'sapphire',
    name: 'Sapfir',
    title: 'Fəal Alim (Tədqiqatçı)',
    leagueName: 'Sapfir Liqa',
    level: 5,
    minXp: 2200,
    maxXp: 3399,
    color: '#3B82F6',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '5',
    gemIcon: '',
    description: 'İslam elmlərində və dərslərdə nümunəvi bilik nümayiş etdirən fəal alim.',
    perks: [
      'Sapfir Liqasında liderlik şansı',
      'Mədrəsənin ən yaxşı 10 tələbəsi sırasına daxil olmaq',
      'Müəllim köməkçisi olma imkanı'
    ]
  },
  {
    id: 6,
    key: 'ruby',
    name: 'Yaqut',
    title: 'Ustad (Mütəxəssis)',
    leagueName: 'Yaqut Liqa',
    level: 6,
    minXp: 3400,
    maxXp: 4999,
    color: '#EF4444',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '6',
    gemIcon: '',
    description: 'Bilikləri ustad dərəcəsinə çatmış, digər tələbələrə örnək olan ustad.',
    perks: [
      'Yaqut Liqası Ustad statusu',
      'Mədrəsə rəhbərliyi tərəfindən fəxri diplom',
      'Xüsusi qırmızı alovlu profil aurası'
    ]
  },
  {
    id: 7,
    key: 'diamond',
    name: 'Almaz',
    title: 'Müdrik (Zirvəçi)',
    leagueName: 'Almaz Liqa',
    level: 7,
    minXp: 5000,
    maxXp: 6999,
    color: '#06B6D4',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '7',
    gemIcon: '',
    description: 'Ən çətin fənn və dərsləri əla nəticələrlə başa vuran müdrik tələbə.',
    perks: [
      'Almaz Liqası Çempionu',
      'Mədrəsə Fəxri Lövhəsində daimi yer',
      'Xüsusi parlaq kristal çərçivə və effektlər'
    ]
  },
  {
    id: 8,
    key: 'legend',
    name: 'Mədrəsə Əfsanəsi',
    title: 'Əfsanəvi Master',
    leagueName: 'Əfsanəvi Liqa',
    level: 8,
    minXp: 7000,
    maxXp: 999999,
    color: '#EC4899',
    badgeBg: '',
    border3d: '',
    glowColor: '',
    icon: '8',
    gemIcon: '',
    description: 'Mədrəsənin ən yüksək şərəf pilləsinə ucalmış əfsanəvi qəhrəman tələbə!',
    perks: [
      'Əfsanəvi Liqanın Mütləq Hakimi',
      'Mədrəsə Böyük Qızıl Medalı',
      'Daimi fəxri təqdirnamə və xüsusi hədiyyə',
      'Əfsanəvi Qızıl-Bənövşəyi Aura'
    ]
  }
];

export interface StudentStats {
  uid: string;
  name: string;
  username?: string;
  className?: string;
  avatar?: string;
  xp: number;
  fivesCount: number;
  foursCount: number;
  threesCount: number;
  twosCount: number;
  attendancePlusCount: number;
  attendanceMinusCount: number;
  rank: RankInfo;
  league: RankInfo;
  rankPosition?: number;
  totalGrades: number;
  gpa: number;
  streakDays: number;
}

/**
 * Calculates XP based on real Firestore entries
 */
export function calculateStudentXP(
  marks: Array<{ mark: string; type?: string }>,
  hwSubmissions: Array<{ grade?: string; score?: number }>,
  achievementsCount: number = 0,
  congratsCount: number = 0
): {
  xp: number;
  fivesCount: number;
  foursCount: number;
  threesCount: number;
  twosCount: number;
  attendancePlusCount: number;
  attendanceMinusCount: number;
  gpa: number;
} {
  let xp = 0;
  let fivesCount = 0;
  let foursCount = 0;
  let threesCount = 0;
  let twosCount = 0;
  let attendancePlusCount = 0;
  let attendanceMinusCount = 0;
  let numericalSum = 0;
  let numericalCount = 0;

  // Process Journal Marks
  marks.forEach((m) => {
    const val = m.mark?.trim();
    if (val === '5') {
      xp += 100;
      fivesCount++;
      numericalSum += 5;
      numericalCount++;
    } else if (val === '4') {
      xp += 75;
      foursCount++;
      numericalSum += 4;
      numericalCount++;
    } else if (val === '3') {
      xp += 50;
      threesCount++;
      numericalSum += 3;
      numericalCount++;
    } else if (val === '2') {
      xp += 20;
      twosCount++;
      numericalSum += 2;
      numericalCount++;
    } else if (val === '+') {
      xp += 15;
      attendancePlusCount++;
    } else if (val === '-') {
      attendanceMinusCount++;
    }
  });

  // Process Homework Submissions
  hwSubmissions.forEach((hw) => {
    const g = hw.grade?.trim();
    if (g === '5') {
      xp += 100;
      fivesCount++;
    } else if (g === '4') {
      xp += 75;
      foursCount++;
    } else if (g === '3') {
      xp += 50;
      threesCount++;
    } else if (hw.score && hw.score >= 90) {
      xp += 100;
    } else if (hw.score && hw.score >= 70) {
      xp += 75;
    } else if (hw.score && hw.score >= 50) {
      xp += 50;
    }
  });

  // Bonus for Achievements & Praise
  xp += achievementsCount * 150;
  xp += congratsCount * 200;

  const gpa = numericalCount > 0 ? Number((numericalSum / numericalCount).toFixed(2)) : 5.0;

  return {
    xp,
    fivesCount,
    foursCount,
    threesCount,
    twosCount,
    attendancePlusCount,
    attendanceMinusCount,
    gpa
  };
}

/**
 * Gets the Rank corresponding to a given XP
 */
export function getRankByXP(xp: number): RankInfo {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXp) {
      return RANKS[i];
    }
  }
  return RANKS[0];
}

/**
 * Gets progress towards next rank (percentage and remaining XP)
 */
export function getRankProgress(xp: number): {
  currentRank: RankInfo;
  nextRank: RankInfo | null;
  progressPercent: number;
  xpInLevel: number;
  levelRange: number;
  remainingXp: number;
} {
  const currentRank = getRankByXP(xp);
  const nextRankIndex = RANKS.findIndex((r) => r.id === currentRank.id) + 1;
  const nextRank = nextRankIndex < RANKS.length ? RANKS[nextRankIndex] : null;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      progressPercent: 100,
      xpInLevel: xp - currentRank.minXp,
      levelRange: 1000,
      remainingXp: 0
    };
  }

  const levelRange = nextRank.minXp - currentRank.minXp;
  const xpInLevel = Math.max(0, xp - currentRank.minXp);
  const progressPercent = Math.min(100, Math.floor((xpInLevel / levelRange) * 100));
  const remainingXp = Math.max(0, nextRank.minXp - xp);

  return {
    currentRank,
    nextRank,
    progressPercent,
    xpInLevel,
    levelRange,
    remainingXp
  };
}
