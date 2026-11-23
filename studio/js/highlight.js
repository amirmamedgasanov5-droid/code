// Подсветка синтаксиса: JS, CSS, HTML/SVG, JSON, Markdown. Монохромная палитра задаётся в CSS (.t-*).
import { esc } from './util.js';

const STR_D = `"(?:[^"\\\\\\n]|\\\\.)*"?`;
const STR = STR_D + `|'(?:[^'\\\\\\n]|\\\\.)*'?`;

const JS_KW = 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|null|undefined|true|false|super|static|get|set|yield|delete|void|interface|type|enum|implements|public|private|readonly|as';

const jsLike = (kw) => [
  ['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)'],
  ['s', '\"\"\"[\\s\\S]*?(?:\"\"\"|$)|' + STR + '|`(?:[^`\\\\]|\\\\[\\s\\S])*`?'],
  ['n', '\\b(?:0[xX][\\da-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[fFLdD]?)\\b'],
  ['k', `\\b(?:${kw})\\b`],
  ['f', '[A-Za-z_$][\\w$]*(?=\\s*[(<{]?)(?=\\()'],
  ['p', '[{}()\\[\\];,.<>=+\\-*/%&|^!?:~@]+'],
];
const KT_KW = 'package|import|class|object|interface|fun|val|var|if|else|when|for|while|do|return|break|continue|try|catch|finally|throw|is|in|as|null|true|false|this|super|override|private|public|protected|internal|open|abstract|data|sealed|companion|lateinit|by|init|constructor|suspend|const|typealias|enum|apply|let|plugins|id|android|dependencies|implementation|def|new';
const SWIFT_KW = 'import|struct|class|enum|protocol|extension|func|let|var|if|else|guard|switch|case|default|for|while|repeat|return|break|continue|in|is|as|nil|true|false|self|super|init|deinit|private|public|internal|fileprivate|open|static|override|some|any|where|try|catch|throw|throws|async|await|@main|@State|@Binding|@AppStorage|@escaping|View|App|Scene';
const DART_KW = 'import|export|library|part|class|extends|implements|with|mixin|abstract|enum|void|var|final|const|late|dynamic|if|else|for|while|do|switch|case|default|return|break|continue|try|catch|on|finally|throw|new|null|true|false|this|super|static|async|await|yield|required|override|is|as|in|get|set|typedef|int|double|String|bool|List|Map|Widget';

const RULES = {
  kt: jsLike(KT_KW),
  swift: jsLike(SWIFT_KW),
  dart: jsLike(DART_KW),
  nui: [
    ['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)'],
    ['s', STR],
    ['n', '\\b\\d+(?:\\.\\d+)?\\b'],
    ['k', '\\b(?:app|state|let|var|fn|screen|persist|if|else|each|for|in|while|return|break|continue|as|true|false|null)\\b'],
    ['f', '\\b(?:column|row|box|scroll|text|button|input|area|toggle|slider|image|spacer|divider|bar|progress)\\b'],
    ['a', '[A-Za-z_][\\w]*(?==)'],
    ['p', '[{}()\\[\\];,.<>=+\\-*/%&|^!?:~]+'],
  ],
  yaml: [
    ['c', '#[^\\n]*'],
    ['s', STR],
    ['a', '^[ \\t-]*[\\w.\\/-]+(?=:)'],
    ['n', '\\b\\d+(?:\\.\\d+)?\\b'],
    ['k', '\\b(?:true|false|null|YES|NO)\\b'],
  ],
  js: [
    ['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)'],
    ['s', STR + '|`(?:[^`\\\\]|\\\\[\\s\\S])*`?'],
    ['n', '\\b(?:0[xX][\\da-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b'],
    ['k', `\\b(?:${JS_KW})\\b`],
    ['f', '[A-Za-z_$][\\w$]*(?=\\s*\\()'],
    ['p', '[{}()\\[\\];,.<>=+\\-*/%&|^!?:~]+'],
  ],
  json: [
    ['a', STR_D + '(?=\\s*:)'],
    ['s', STR],
    ['n', '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b'],
    ['k', '\\b(?:true|false|null)\\b'],
    ['p', '[{}\\[\\],:]+'],
  ],
  css: [
    ['c', '\\/\\*[\\s\\S]*?(?:\\*\\/|$)'],
    ['s', STR],
    ['k', '@[\\w-]+'],
    ['a', '--[\\w-]+|[\\w-]+(?=\\s*:\\s*[^;{}]*[;}])'],
    ['n', '#[0-9a-fA-F]{3,8}\\b|-?\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\\b'],
    ['f', '[.#][\\w-]+|[\\w-]+(?=\\()'],
    ['p', '[{}();,:>+~*]+'],
  ],
  htmltag: [
    ['c', '<!--[\\s\\S]*?(?:-->|$)'],
    ['c', '<![A-Za-z][^>]*>'],
    ['k', '<\\/?[A-Za-z][\\w:-]*'],
    ['a', '[\\w:@.-]+(?=\\s*=)'],
    ['s', STR],
    ['p', '\\/?>|='],
  ],
  md: [
    ['k', '^#{1,6} .*$'],
    ['s', '```[\\s\\S]*?(?:```|$)|`[^`\\n]*`'],
    ['f', '\\[[^\\]\\n]*\\]\\([^)\\n]*\\)'],
    ['k', '\\*\\*[^*\\n]+\\*\\*'],
    ['p', '^\\s*(?:[-*+]|\\d+\\.)\\s|^>'],
  ],
};

const compiled = {};
function rx(lang) {
  if (!compiled[lang]) {
    const flags = lang === 'md' || lang === 'yaml' ? 'gm' : 'g';
    compiled[lang] = { re: new RegExp(RULES[lang].map((r) => '(' + r[1] + ')').join('|'), flags), cls: RULES[lang].map((r) => r[0]) };
  }
  return compiled[lang];
}

function tok(src, lang) {
  const { re, cls } = rx(lang);
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out += esc(src.slice(last, m.index));
    let i = 1;
    while (m[i] === undefined) i++;
    out += `<span class="t-${cls[i - 1]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function html(src) {
  // вставки <script>/<style> подсвечиваем своими правилами
  const block = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>|$)/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = block.exec(src))) {
    if (m[0] === '') {
      block.lastIndex++;
      continue;
    }
    out += tok(src.slice(last, m.index), 'htmltag') + tok(m[1], 'htmltag');
    const isJson = /type\s*=\s*["']?(?:application\/json|importmap)/i.test(m[1]);
    out += tok(m[3], m[2].toLowerCase() === 'style' ? 'css' : isJson ? 'json' : 'js') + tok(m[4], 'htmltag');
    last = m.index + m[0].length;
  }
  return out + tok(src.slice(last), 'htmltag');
}

/** Возвращает HTML с подсветкой. Для неизвестных языков — просто экранированный текст. */
export function highlight(src, lang) {
  if (src.length > 400000) return esc(src);
  try {
    if (lang === 'html') return html(src);
    if (RULES[lang]) return tok(src, lang);
  } catch {
    /* на любой сбой — без подсветки */
  }
  return esc(src);
}
