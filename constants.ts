import { Announcement, Homework, Lesson, User, Grade } from './types';

// All data is now fetched from Firebase. 
// These arrays remain empty to ensure no mock data is accidentally used.

export const MOCK_USER_STUDENT: User = {
  uid: '',
  id: '',
  name: '',
  email: '',
  role: 'student',
  className: ''
};

export const MOCK_USER_TEACHER: User = {
  uid: '',
  id: '',
  name: '',
  email: '',
  role: 'teacher'
};

export const SCHEDULE: Lesson[] = [];
export const ANNOUNCEMENTS: Announcement[] = [];
export const HOMEWORKS: Homework[] = [];
export const MOCK_GRADES: Grade[] = [];
