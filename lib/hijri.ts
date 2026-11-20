export function hijriParts(d: Date) {
  try {
    const p = new Intl.DateTimeFormat('ru-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return { day: get('day'), month: get('month'), year: get('year').replace(/\D/g, '') };
  } catch {
    return null;
  }
}
