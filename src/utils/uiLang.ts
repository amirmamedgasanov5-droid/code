import dict from '../data/ruDict.json';

const KEY = 'ui_lang';
const EVT = 'uilangchange';
const D = dict as Record<string, string>;

/** The platform is Russian-only. */
export const getUiLang = (): 'ru' | null => 'ru';

export const setUiLang = (l: 'ru' | null) => {
  try { l ? localStorage.setItem(KEY, l) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
};

export const onUiLangChange = (fn: () => void) => {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
};

const MONTHS: Record<string, string> = { yanvar: 'января', fevral: 'февраля', mart: 'марта', aprel: 'апреля', may: 'мая', iyun: 'июня', iyul: 'июля', avqust: 'августа', sentyabr: 'сентября', oktyabr: 'октября', noyabr: 'ноября', dekabr: 'декабря' };
const WD: Record<string, string> = { 'bazar ertəsi': 'понедельник', 'çərşənbə axşamı': 'вторник', 'çərşənbə': 'среда', 'cümə axşamı': 'четверг', 'cümə': 'пятница', 'şənbə': 'суббота', 'bazar': 'воскресенье' };
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d+) dəq əvvəl$/, m => `${m[1]} мин назад`],
  [/^(\d+) saat əvvəl$/, m => `${m[1]} ч назад`],
  [/^(\d+) gün əvvəl$/, m => `${m[1]} дн. назад`],
  [/^indicə$/, () => 'только что'],
  [/^Növbəti rütbəyə (\d+) XP qalıb$/, m => `До следующего ранга осталось ${m[1]} XP`],
  [/^(\d{1,2}) ([a-zəıöüçşğ]+), ([a-zəıöüçşğ ]+)$/i, m => (MONTHS[m[2].toLowerCase()] && WD[m[3].toLowerCase()]) ? `${m[1]} ${MONTHS[m[2].toLowerCase()]}, ${WD[m[3].toLowerCase()]}` : m[0]],
  [/^(\d+) dərs$/, m => `${m[1]} урок.`],
  [/^Tələbə: (\d+)$/, m => `Ученик: ${m[1]}`],
  [/^«(.*)» imtahanı bütün şagirdlərə göndərilsin\? Müddət: (.*)$/s, m => `Отправить экзамен «${m[1]}» всем ученикам? Срок: ${m[2]}`],
  [/^«(.*)» imtahanı yenidən göndərilsin\? Müddət bu andan (.*)$/s, m => `Отправить экзамен «${m[1]}» снова? Срок с этого момента: ${m[2]}`],
  [/^«(.*)» imtahanı açıldı\. (.*)$/s, m => `Экзамен «${m[1]}» открыт. ${m[2]}`],
];

/** Translate one Azerbaijani UI string to Russian (exact match, or "Head: tail" / "Head tail" with a known head). */
export const toRu = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const lead = raw.slice(0, raw.length - raw.trimStart().length);
  const trail = raw.slice(raw.trimEnd().length);
  const hit = D[trimmed];
  if (hit) return lead + hit + trail;
  for (const [re, fn] of RULES) { const r = trimmed.match(re); if (r) return lead + fn(r) + trail; }
  // "Xəta: details" style
  const m = trimmed.match(/^([^:]{2,60}:)\s*(.*)$/s);
  if (m && D[m[1]]) return lead + D[m[1]] + ' ' + m[2] + trail;
  return raw;
};

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const textOrig = new WeakMap<Node, string>();
const attrOrig = new WeakMap<Element, Record<string, string>>();

const doText = (n: Text) => {
  const cur = n.nodeValue || '';
  const base = textOrig.get(n);
  // text changed by React after we translated it: treat the new value as the original
  const src = base !== undefined && D[base.trim()] !== undefined && toRu(base) === cur ? base : cur;
  const out = toRu(src);
  if (out !== cur) { textOrig.set(n, src); n.nodeValue = out; }
  else if (base === undefined) textOrig.set(n, cur);
};

const doEl = (el: Element) => {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const map = attrOrig.get(el) || {};
    const src = map[a] !== undefined && toRu(map[a]) === v ? map[a] : v;
    const out = toRu(src);
    if (out !== v) { map[a] = src; attrOrig.set(el, map); el.setAttribute(a, out); }
  }
};

const walk = (root: Node) => {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest('[data-no-translate]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
  doEl(el);
  el.childNodes.forEach(walk);
};

const revert = (root: Node) => {
  if (root.nodeType === Node.TEXT_NODE) {
    const o = textOrig.get(root);
    if (o !== undefined) (root as Text).nodeValue = o;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  const m = attrOrig.get(el);
  if (m) for (const a in m) el.setAttribute(a, m[a]);
  el.childNodes.forEach(revert);
};

let observer: MutationObserver | null = null;
let origConfirm: typeof window.confirm | null = null;
let origAlert: typeof window.alert | null = null;

export const startRu = () => {
  if (observer) return;
  walk(document.body);
  observer = new MutationObserver(muts => {
    observer?.disconnect();
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doEl(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
    observer?.observe(document.body, OPTS);
  });
  observer.observe(document.body, OPTS);
  origConfirm = window.confirm; origAlert = window.alert;
  window.confirm = (msg?: string) => origConfirm!.call(window, toRu(msg || ''));
  window.alert = (msg?: any) => origAlert!.call(window, toRu(String(msg ?? '')));
};

const OPTS: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };

export const stopRu = () => {
  observer?.disconnect(); observer = null;
  revert(document.body);
  if (origConfirm) window.confirm = origConfirm;
  if (origAlert) window.alert = origAlert;
};
