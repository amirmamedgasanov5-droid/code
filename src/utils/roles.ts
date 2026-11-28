import { User } from '../../types';

/** Main administrator. Must match the email in firestore.rules. */
export const ADMIN_EMAIL = 'amirmamedgasanov5@gmail.com';

export const isAdminUser = (u?: Pick<User, 'role' | 'email'> | null): boolean =>
  !!u && (u.role === 'admin' || (u.email || '').toLowerCase() === ADMIN_EMAIL);

/** Teachers and administrators. */
export const isStaffUser = (u?: Pick<User, 'role' | 'email'> | null): boolean =>
  !!u && (isAdminUser(u) || u.role === 'teacher');

export const isParentUser = (u?: Pick<User, 'role' | 'email'> | null): boolean => !!u && u.role === 'parent' && !isAdminUser(u);
