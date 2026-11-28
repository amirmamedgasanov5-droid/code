
export type Role = 'student' | 'teacher' | 'admin' | 'parent';
export type Language = 'az' | 'ru' | 'tr' | 'ar' | 'en';
export type Theme = 'light';

export interface User {
  uid: string;
  id: string; 
  username?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: Role;
  avatar?: string;
  photoURL?: string;
  className?: string;
  class?: string;
  language?: Language;
  theme?: Theme;
  effectsEnabled?: boolean;
  particlesMode?: 'none' | 'snow' | 'bubbles' | 'stars' | 'confetti' | 'hearts' | 'fireflies' | 'roses';
  cursorFollower?: boolean;
  grainEffect?: boolean;
  parallaxEnabled?: boolean;
  glassmorphism?: boolean;
  animationsEnabled?: boolean;
  highContrast?: boolean;
  compactMode?: boolean;
  showNotifications?: boolean;
  soundEffects?: boolean;
  createdAt?: string;
  isBlocked?: boolean;
  blockedUntil?: string | null;
  blockReason?: string;
  blockedAt?: string;
  blockedBy?: string;
  parentPin?: string;
  /** Set at sign-up when someone asks to become a teacher. The administrator approves it. */
  requestedRole?: 'teacher';
  /** Parent accounts: the student they are linked to. */
  childUid?: string;
  childName?: string;
  inviteCode?: string;
  /** Activity tracking (written by ActivityTracker). */
  lastActiveAt?: string;
  lastLoginAt?: string;
  loginCount?: number;
}

export interface ParentNote {
  id: string;
  studentId: string;
  studentUid: string;
  studentName: string;
  studentClass?: string;
  parentName: string;
  parentPhone?: string;
  subject: string;
  message: string;
  status: 'pending' | 'reviewed' | 'resolved';
  reply?: string;
  repliedBy?: string;
  repliedAt?: string;
  createdAt: string;
}

export type ComplaintType = 'warning' | 'reprimand' | 'final_warning' | 'ban';
export type ComplaintStatus = 'active' | 'resolved' | 'cancelled';

export interface Complaint {
  id: string;
  studentId: string;
  studentUid: string;
  studentName: string;
  studentUsername?: string;
  studentClass?: string;
  title: string;
  description: string;
  type: ComplaintType;
  isBlocked?: boolean;
  blockDays?: number;
  blockedUntil?: string | null;
  blockReason?: string;
  createdBy: string;
  creatorEmail: string;
  status: ComplaintStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorId: string;
  category: string;
  language: Language;
  readingEffect?: 'none' | 'snow' | 'fire' | 'roses' | 'leaves' | 'rain';
  coverUrl?: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  subject: string;
  teacherName: string;
  time: string;
  daysOfWeek: number[];
  room: string;
  lessonLink: string;
  language: Language;
}

export type AssignmentType = 'homework' | 'classwork' | 'mock' | 'test' | 'notes';

export interface Question {
  id: string;
  text: string;
  type: 'choice' | 'written';
  options?: string[];
  correctAnswer?: number; // Index of the correct option for 'choice'
}

export interface Homework {
  id: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  isCompleted: boolean;
  lessonId: string;
  status?: 'active' | 'archived';
  imageUrl?: string;
  language: Language;
  type: AssignmentType;
  questions?: Question[];
  teacherId: string;
}

export interface Submission {
  id: string;
  homeworkId: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  studentUsername?: string;
  imageUrl?: string;
  textResponse?: string;
  answers?: { [questionId: string]: string | number };
  grade?: string;
  score?: number;
  submittedAt: string;
  status: 'pending' | 'graded';
  teacherComment?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  priority: 'low' | 'medium' | 'high';
}

export interface Grade {
  id: string;
  studentId: string;
  studentUsername?: string;
  subject: string;
  score?: number; 
  attendance?: '+' | '-'; 
  date: string;
  comment?: string;
  teacherId: string;
  surveyId?: string;
}

export interface Chat {
  id: string;
  participants: string[]; 
  participantNames: { [key: string]: string };
  lastMessage: string;
  lastMessageTime: any; 
  updatedAt: any;
}

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  imageUrl?: string;
  createdAt: any;
}

export interface GlobalMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  createdAt: any;
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  questions: {
    id: string;
    text: string;
    type: 'choice' | 'text';
    options?: string[];
    mandatory?: boolean;
  }[];
  mandatory: boolean;
  active: boolean;
  createdAt: string;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  studentId: string;
  studentUid: string;
  studentName: string;
  studentUsername?: string;
  answers: { [questionId: string]: string };
  submittedAt: string;
}

export interface Congratulation {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  title: string;
  message: string;
  seen: boolean;
  seenBy?: string[];
  diplomaType?: string;
  serialNumber?: string;
  createdAt: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  content: string;
  language: Language;
  category: 'hadith' | 'ayah' | 'other';
  teacherId: string;
  teacherName: string;
  createdAt: string;
}

export interface ExtraCourse {
  id: string;
  title: string;
  description: string;
  schedule: string;
  lessonLink?: string;
  teacherId: string;
  teacherName: string;
  createdAt: string;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  studentUid: string;
  studentId?: string;
  studentName: string;
  studentClass?: string;
  enrolledAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'paint' | 'calculator' | 'notes' | 'todo' | 'feed' | 'game' | 'exam';
  createdAt: any;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  questions: {
    id: string;
    text: string;
    options: string[];
    correctIndex: number;
  }[];
  active: boolean;
  createdAt: string;
  /** false = draft; the exam becomes visible to students after "send". Missing = old exam (always visible). */
  published?: boolean;
  publishedAt?: string;
  /** Students can start and submit until this moment. */
  expiresAt?: string;
  expiresAtMs?: number;
  /** Hand-made translations; the student can switch the exam to Russian. */
  translations?: {
    ru?: { title: string; description: string; questions: { id: string; text: string; options: string[] }[] };
  };
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  studentUsername?: string;
  answers: {
    questionId: string;
    selectedOption: number;
    isCorrect: boolean;
  }[];
  score: number;
  totalQuestions: number;
  submittedAt: string;
  /** Mark written to the journal by a teacher (5/4/3/2). */
  gradeMark?: string;
  gradedAt?: string;
  gradedBy?: string;
}

export interface UserService {
  id: string;
  userId: string;
  serviceId: string;
  name: string;
  type: string;
  installedAt: any;
}

export interface AwardItem {
  id: string;
  type: 'diploma' | 'certificate' | 'achievement';
  studentId?: string;
  studentName?: string;
  diplomaType?: 'diploma' | 'certificate' | 'honor' | 'quran' | 'discipline';
  title?: string;
  reason?: string;
  teacherName?: string;
  date?: string;
  serialNumber?: string;
  imageUrl?: string;
  createdAt?: { seconds: number };
  [key: string]: any;
}

export interface Banner {
  id: string;
  title: string;
  text: string;
  imageUrl?: string;
  linkUrl?: string;
  linkLabel?: string;
  tone: 'indigo' | 'slate' | 'emerald' | 'rose';
  active: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface ParentInvite {
  id: string; // the code itself
  studentUid: string;
  studentName: string;
  used: boolean;
  parentUid?: string;
  createdBy: string;
  createdAt: string;
  usedAt?: string;
}
