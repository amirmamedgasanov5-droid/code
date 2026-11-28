import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Image as ImageIcon, Loader2, X, Megaphone } from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Banner, User } from '../types';
import { isAdminUser } from '../src/utils/roles';
import { uploadImageToImgBB } from '../src/utils/imgbb';
import { handleFirestoreError, OperationType } from '../src/utils/firestoreError';
import { Toast, ToastType } from '../components/Toast';

const TONES: { id: Banner['tone']; label: string; swatch: string }[] = [
  { id: 'indigo', label: 'İndiqo', swatch: 'bg-brand-500' },
  { id: 'slate', label: 'Boz', swatch: 'bg-slate-500' },
  { id: 'emerald', label: 'Yaşıl', swatch: 'bg-emerald-500' },
  { id: 'rose', label: 'Qırmızı', swatch: 'bg-rose-500' },
];

const empty = { title: '', text: '', imageUrl: '', linkUrl: '', linkLabel: '', tone: 'indigo' as Banner['tone'] };

export const Banners: React.FC<{ user: User }> = ({ user }) => {
  const admin = isAdminUser(user);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as ToastType });
  const [accessError, setAccessError] = useState('');

  const describeAccessError = (err: any) => {
    const who = auth.currentUser?.isAnonymous ? 'anonim giriş (e-poçt yoxdur)' : auth.currentUser?.email || 'naməlum';
    const denied = String(err?.code || err?.message || '').includes('permission');
    return denied
      ? `İcazə yoxdur. Daxil olduğunuz hesab: ${who}. Yoxlayın: 1) Firestore qaydaları Firebase Console-da dərc edilib? 2) Hesab idarəçi/müəllim e-poçtu ilə daxil olub?`
      : 'Xəta: ' + (err?.message || 'əməliyyat alınmadı');
  };

  useEffect(() => {
    const q = query(collection(db, 'banners'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      snap => {
        setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));
        setLoading(false);
      },
      err => {
        setLoading(false);
        setAccessError(describeAccessError(err));
        try { handleFirestoreError(err, OperationType.LIST, 'banners'); } catch {}
      }
    );
  }, []);

  const canEdit = (b: Banner) => admin || b.authorId === user.uid;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      let imageUrl = form.imageUrl.trim();
      if (file) imageUrl = await uploadImageToImgBB(file);
      await addDoc(collection(db, 'banners'), {
        title: form.title.trim(),
        text: form.text.trim(),
        imageUrl,
        linkUrl: form.linkUrl.trim(),
        linkLabel: form.linkLabel.trim(),
        tone: form.tone,
        active: true,
        authorId: user.uid,
        authorName: user.name,
        createdAt: new Date().toISOString(),
      });
      setForm(empty);
      setFile(null);
      setShowForm(false);
      setToast({ visible: true, message: 'Banner dərc edildi', type: 'success' });
    } catch (err: any) {
      setAccessError(describeAccessError(err));
      setToast({ visible: true, message: describeAccessError(err), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (b: Banner) => {
    try {
      await updateDoc(doc(db, 'banners', b.id), { active: !b.active });
    } catch (err) {
      setAccessError(describeAccessError(err));
    }
  };

  const remove = async (b: Banner) => {
    if (!window.confirm(`"${b.title}" bannerini silmək istəyirsiniz?`)) return;
    try {
      await deleteDoc(doc(db, 'banners', b.id));
    } catch (err) {
      setAccessError(describeAccessError(err));
    }
  };

  const input =
    'w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <Toast isVisible={toast.visible} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, visible: false })} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Bannerlər</h1>
          <p className="text-xs text-muted mt-0.5">Ana səhifədəki elan bannerləri. Müəllimlər və idarəçi əlavə edə bilər.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary self-start sm:self-auto">
          <Plus className="w-3.5 h-3.5" />
          <span>Yeni banner</span>
        </button>
      </div>

      {accessError && (
        <div className="card !p-4 border-red-200 bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300">{accessError}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Yeni banner</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted hover:text-text" aria-label="Bağla">
              <X className="w-4 h-4" />
            </button>
          </div>

          <input className={input} placeholder="Başlıq" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required maxLength={120} />
          <textarea className={`${input} resize-none`} rows={3} placeholder="Mətn (könüllü)" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} maxLength={600} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={input} placeholder="Şəkil linki (könüllü)" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} disabled={!!file} />
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*" id="banner-file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              <label htmlFor="banner-file" className="btn-secondary cursor-pointer flex-1 min-w-0">
                <ImageIcon className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                <span className="truncate">{file ? file.name : 'və ya şəkil yüklə'}</span>
              </label>
              {file && (
                <button type="button" onClick={() => setFile(null)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label="Sil">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <input className={input} placeholder="Düymə linki (könüllü)" value={form.linkUrl} onChange={e => setForm({ ...form, linkUrl: e.target.value })} />
            <input className={input} placeholder="Düymə yazısı (məs: Ətraflı)" value={form.linkLabel} onChange={e => setForm({ ...form, linkLabel: e.target.value })} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted mr-1">Rəng:</span>
            {TONES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm({ ...form, tone: t.id })}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
                  form.tone === t.id ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'border-border text-muted hover:text-text'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${t.swatch}`} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Ləğv et</button>
            <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Dərc et'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : banners.length === 0 ? (
        <div className="card text-center py-14">
          <Megaphone className="w-8 h-8 text-brand-300 mx-auto mb-3" />
          <p className="text-sm text-muted">Hələ banner yoxdur. «Yeni banner» ilə ilkini əlavə edin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map(b => (
            <div key={b.id} className={`card !p-0 overflow-hidden flex flex-col ${b.active ? '' : 'opacity-60'}`}>
              {b.imageUrl && <img src={b.imageUrl} alt={b.title} className="w-full h-36 object-cover" referrerPolicy="no-referrer" />}
              <div className="p-5 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text">{b.title}</h3>
                  {!b.active && <span className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-muted">Gizlədilib</span>}
                </div>
                {b.text && <p className="text-xs text-muted line-clamp-3 whitespace-pre-wrap">{b.text}</p>}
                <p className="text-[11px] text-muted">{b.authorName} · {new Date(b.createdAt).toLocaleDateString('az-AZ')}</p>
              </div>
              {canEdit(b) && (
                <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
                  <button onClick={() => toggle(b)} className="btn-secondary !px-3 !py-1.5">
                    {b.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{b.active ? 'Gizlət' : 'Göstər'}</span>
                  </button>
                  <button onClick={() => remove(b)} className="btn-secondary !px-3 !py-1.5 !text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sil</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
