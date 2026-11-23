// Заметки: состояние в noodle.storage, экраны «список» и «редактор», системный «Назад».
const $ = (id) => document.getElementById(id);
let notes = noodle.storage.get('notes', []);
let current = null;

const save = () => noodle.storage.set('notes', notes);

function showList() {
  current = null;
  $('editor').hidden = true;
  $('list').hidden = false;
  $('back').hidden = true;
  $('add').hidden = false;
  $('title').textContent = 'NOTES';
  $('list').innerHTML = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Пока пусто. Нажмите +';
    $('list').append(li);
  }
  for (const n of notes) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = n.title || 'Без названия';
    const s = document.createElement('small');
    s.textContent = n.body || '—';
    li.append(b, s);
    li.onclick = () => open(n.id);
    $('list').append(li);
  }
}

function open(id) {
  current = notes.find((n) => n.id === id);
  $('list').hidden = true;
  $('editor').hidden = false;
  $('back').hidden = false;
  $('add').hidden = true;
  $('title').textContent = 'EDIT';
  $('note-title').value = current.title;
  $('note-body').value = current.body;
}

$('add').onclick = () => {
  const n = { id: Date.now(), title: '', body: '' };
  notes.unshift(n);
  save();
  open(n.id);
  $('note-title').focus();
};
$('back').onclick = showList;
$('del').onclick = () => {
  notes = notes.filter((n) => n !== current);
  save();
  showList();
  noodle.toast('Удалено');
};
for (const id of ['note-title', 'note-body']) {
  $(id).oninput = () => {
    current.title = $('note-title').value;
    current.body = $('note-body').value;
    save();
  };
}

// Системная «Назад»: из редактора — в список; из списка — закрывает приложение.
noodle.onBack(() => {
  if (current) { showList(); return true; }
  return false;
});

showList();
