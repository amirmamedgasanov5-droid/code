import { Logo } from '../components/Logo';
import React, { useState } from 'react';
import { User, Role } from '../types';
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowRight, Check } from 'lucide-react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { Toast, ToastType } from '../components/Toast';

export const Login: React.FC = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });
  const [role, setRole] = useState<Role>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  const showToast = (message: string, type: ToastType) => {
    setToast({ visible: true, message, type });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (isRegistering && !agreed) {
      showToast("Zəhmət olmasa daxili qaydalar və istifadə şərtləri ilə razılaşın.", "error");
      return;
    }
    setIsLoading(true);

    try {
      await setPersistence(auth, browserLocalPersistence);
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        if (role === 'parent') {
          const code = inviteCode.trim().toUpperCase();
          try {
            const inviteRef = doc(db, 'parent_invites', code);
            const invite = await getDoc(inviteRef);
            if (!code || !invite.exists() || invite.data().used) {
              throw new Error('invalid-invite');
            }
            const parentName = `${firstName.trim()} ${lastName.trim()}`.trim();
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              id: userCredential.user.uid,
              uid: userCredential.user.uid,
              name: parentName,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim().toLowerCase(),
              role: 'parent',
              childUid: invite.data().studentUid,
              childName: invite.data().studentName,
              inviteCode: code,
              theme: 'light',
              language: 'ru',
              showNotifications: true,
              createdAt: new Date().toISOString(),
            });
            await updateDoc(inviteRef, { used: true, parentUid: userCredential.user.uid, usedAt: new Date().toISOString() });
            showToast('Valideyn hesabı yaradıldı. Xoş gəlmisiniz!', 'success');
          } catch (inviteErr: any) {
            // Roll back the half-created account so the e-mail can be reused.
            await userCredential.user.delete().catch(() => {});
            await signOut(auth).catch(() => {});
            showToast(
              inviteErr?.message === 'invalid-invite'
                ? 'Dəvət kodu yanlışdır və ya artıq istifadə olunub. Kodu məktəb idarəsindən alın.'
                : 'Qeydiyyat alınmadı: ' + (inviteErr?.message || 'xəta'),
              'error'
            );
          }
          return;
        }

        const newUser: User = {
          id: userCredential.user.uid,
          uid: userCredential.user.uid,
          username: username.trim().toLowerCase(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          role: 'student',
          ...(role === 'teacher' ? { requestedRole: 'teacher' as const } : {}),
          theme: 'light',
          language: 'ru',
          className: '1-A',
          effectsEnabled: false,
          animationsEnabled: true,
          glassmorphism: false,
          showNotifications: true,
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
        showToast(role === 'teacher' ? "Hesab yaradıldı. Müəllim hüququ idarəçi təsdiqindən sonra aktiv olacaq." : "Akademik hesab uğurla təsis edildi.", "success");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Sistemə giriş təsdiqləndi.", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Giriş zamanı xəta baş verdi.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-text">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
      <Toast 
        isVisible={toast.visible} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast({ ...toast, visible: false })} 
      />

      {/* Main Auth Container */}
      <div className="w-full max-w-[400px] space-y-6">
        
        {/* Minimal Academic Brand Header */}
        <div className="text-center space-y-2">
          <Logo className="w-20 h-20 mx-auto mb-2" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              İsnad Mədrəsəsi
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Akademik İdarəetmə və Tədris Portalı
            </p>
          </div>
        </div>

        {/* Clean Card */}
        <div className="bg-white dark:bg-[#111214] rounded-3xl shadow-md p-7 sm:p-8  space-y-5">
          
          {/* Segmented Auth Switcher */}
          <div className="flex bg-neutral-100 dark:bg-neutral-900/90 p-1 rounded-xl border border-neutral-200/50 dark:border-neutral-800/80">
            <button 
              type="button"
              onClick={() => setIsRegistering(false)} 
              className={`flex-1 py-1.5 text-xs font-medium rounded-xl transition-all ${
                !isRegistering 
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ' 
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Daxil ol
            </button>
            <button 
              type="button"
              onClick={() => setIsRegistering(true)} 
              className={`flex-1 py-1.5 text-xs font-medium rounded-xl transition-all ${
                isRegistering 
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ' 
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Qeydiyyat
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Adınız
                    </label>
                    <input 
                      type="text" 
                      value={firstName} 
                      onChange={e => setFirstName(e.target.value)} 
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none transition-colors" 
                      placeholder="Əli" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Soyadınız
                    </label>
                    <input 
                      type="text" 
                      value={lastName} 
                      onChange={e => setLastName(e.target.value)} 
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none transition-colors" 
                      placeholder="Əliyev" 
                      required 
                    />
                  </div>
                </div>

                {role !== 'parent' && (
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    İstifadəçi adı
                  </label>
                  <input 
                    type="text" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none transition-colors" 
                    placeholder="ali_123" 
                    required 
                  />
                </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                    Akademik Rol
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      type="button" 
                      onClick={() => setRole('student')} 
                      className={`py-2 px-3 text-xs font-medium rounded-xl border text-center transition-all flex items-center justify-center gap-1.5 ${
                        role === 'student' 
                          ? 'border-brand-600 bg-brand-600 text-white' 
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                      }`}
                    >
                      {role === 'student' && <Check className="w-3.5 h-3.5" />}
                      <span>Tələbə</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setRole('teacher')} 
                      className={`py-2 px-3 text-xs font-medium rounded-xl border text-center transition-all flex items-center justify-center gap-1.5 ${
                        role === 'teacher' 
                          ? 'border-brand-600 bg-brand-600 text-white' 
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                      }`}
                    >
                      {role === 'teacher' && <Check className="w-3.5 h-3.5" />}
                      <span>Müəllim</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setRole('parent')} 
                      className={`py-2 px-3 text-xs font-medium rounded-xl border text-center transition-all flex items-center justify-center gap-1.5 ${
                        role === 'parent' 
                          ? 'border-brand-600 bg-brand-600 text-white' 
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                      }`}
                    >
                      {role === 'parent' && <Check className="w-3.5 h-3.5" />}
                      <span>Valideyn</span>
                    </button>
                  </div>
                  {role === 'parent' && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                        Dəvət kodu (məktəb idarəsi verir)
                      </label>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={e => setInviteCode(e.target.value.toUpperCase())}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-sm tracking-widest text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none transition-colors"
                        placeholder="XXXXXXXX"
                        maxLength={12}
                        required
                      />
                      <p className="text-[11px] text-neutral-500 mt-1.5">Kod yalnız bir dəfə işləyir. Şifrəni özünüz təyin edirsiniz, övlad onu bilməyəcək.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                E-poçt ünvanı
              </label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none transition-colors" 
                placeholder="name@example.com" 
                required 
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                  Şifrə
                </label>
              </div>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 outline-none pr-9 transition-colors" 
                  placeholder="••••••••" 
                  required 
                  minLength={6} 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  aria-label="Şifrəni göstər"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {isRegistering && (
              <div className="flex items-start gap-2 pt-1">
                <input 
                  type="checkbox" 
                  id="agreed" 
                  checked={agreed} 
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-700 text-brand-600 focus:ring-brand-600"
                />
                <label htmlFor="agreed" className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                  Mən akademiya daxili nizamnaməsi və tədris şərtləri ilə razıyam.
                </label>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading} 
              className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2.5 rounded-xl text-xs font-medium transition-colors  flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{isRegistering ? 'Hesab Təsis Et' : 'Daxil Ol'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {!isRegistering && (
            <button
              type="button"
              onClick={async () => {
                if (!email.trim()) {
                  showToast('Əvvəlcə e-poçt ünvanını yazın.', 'error');
                  return;
                }
                try {
                  await sendPasswordResetEmail(auth, email.trim());
                  showToast('Şifrəni yeniləmə linki e-poçta göndərildi. Spam qovluğuna da baxın.', 'success');
                } catch (err: any) {
                  showToast('Link göndərilmədi: ' + (err?.message || 'xəta'), 'error');
                }
              }}
              className="w-full text-center text-xs text-brand-600 hover:underline -mt-1"
            >
              Şifrəni unutdum
            </button>
          )}


        </div>

        {/* Quiet Footer */}
        <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-600 font-normal">
          © 2026 İsnad Mədrəsəsi · Bütün hüquqlar qorunur
        </p>

      </div>
      </div>
    </div>
  );
};
