/* Cybersprouts — lesson view.
   ?module=<id>&lesson=<id>   (lesson defaults to the first unfinished one) */

const params = new URLSearchParams(location.search);
const mod = getModule(params.get('module')) || getModule('basics');

let state = Store.read();

/* Entering a red/blue module themes the whole page for that side, without
   overwriting the learner's chosen specialization. */
const pageTeam = (mod.track === 'red' || mod.track === 'blue') ? mod.track : state.team;

function currentLesson() {
  const requested = params.get('lesson');
  if (requested) {
    const found = mod.lessons.find(l => l.id === requested);
    if (found) return found;
  }
  return mod.lessons.find(l => !state.completed.includes(key(mod.id, l.id))) || mod.lessons[0];
}

/* Lessons without authored content show an honest draft state rather than
   filler prose — this is a mockup, not a finished curriculum. */
function draftBody(lesson) {
  const outline = [
    ['Warm-up', 'Where this shows up in real work, and why it is worth your time.'],
    ['Core concept', lesson.summary],
    ['Walkthrough', 'A guided example you follow along with, step by step.'],
    ['Check yourself', 'Two or three questions to confirm it landed before moving on.'],
    ['Going deeper', 'Optional reading and practice for anyone who wants more.']
  ];
  return `
    <div class="draft-note">
      <strong>Content not written yet.</strong> This lesson is scaffolded but unwritten — the outline below
      is the shape it will take. Several lessons on this roadmap are fully written; look for
      <em>The CIA Triad</em>, <em>Your First Security Script</em>, <em>IP Addressing &amp; Subnetting</em>,
      <em>Active Scanning with Nmap</em>, <em>Triage</em>, and <em>Prompt Injection &amp; Jailbreaks</em>.
      <ul class="draft-outline">
        ${outline.map(([h, d]) => `<li><span>${h}</span>${d}</li>`).join('')}
      </ul>
    </div>`;
}

function render() {
  state = Store.read();
  applyTheme(pageTeam);

  const lesson = currentLesson();
  const prog = moduleProgress(mod, state);
  const done = state.completed.includes(key(mod.id, lesson.id));
  const idx = mod.lessons.indexOf(lesson);

  document.title = `${lesson.title} — Cybersprouts`;

  /* sidebar */
  document.getElementById('mod-title').textContent = mod.title;
  document.getElementById('mod-meta').textContent =
    `${prog.done}/${prog.total} complete · ${mod.lessons.reduce((n, l) => n + l.mins, 0)} min total`;

  document.getElementById('toc').innerHTML = mod.lessons.map(l => {
    const isDone = state.completed.includes(key(mod.id, l.id));
    return `
      <li>
        <a href="lesson.html?module=${mod.id}&lesson=${l.id}" class="${l.id === lesson.id ? 'active' : ''}">
          <span class="tick ${isDone ? 'on' : ''}">${isDone ? '✓' : ''}</span>
          <span>${l.title}</span>
        </a>
      </li>`;
  }).join('');

  /* article */
  const trackName = { core: 'Core path', red: 'Red team', blue: 'Blue team', ai: 'Independent' }[mod.track];
  document.getElementById('crumbs').innerHTML =
    `${trackName} / <b>${mod.title}</b> / Lesson ${idx + 1} of ${mod.lessons.length}`;
  document.getElementById('lesson-title').textContent = lesson.title;
  document.getElementById('lesson-pills').innerHTML = `
    <span class="pill"><i class="dot"></i>${lesson.mins} min</span>
    <span class="pill">${mod.track === 'core' ? 'Foundational' : mod.track === 'ai' ? 'Anytime' : 'Specialization'}</span>
    ${done ? '<span class="pill">✓ Completed</span>' : ''}`;
  document.getElementById('lesson-summary').textContent = lesson.summary;
  document.getElementById('lesson-body').innerHTML =
    LESSON_BODIES[key(mod.id, lesson.id)] || draftBody(lesson);

  /* footer controls */
  const completeBtn = document.getElementById('complete-btn');
  completeBtn.textContent = done ? '✓ Completed — undo' : 'Mark as complete';
  completeBtn.className = done ? 'btn' : 'btn btn-ghost';

  const nextBtn = document.getElementById('next-btn');
  const next = mod.lessons[idx + 1];
  if (next) {
    nextBtn.href = `lesson.html?module=${mod.id}&lesson=${next.id}`;
    nextBtn.textContent = 'Next lesson →';
  } else {
    nextBtn.href = 'roadmap.html';
    nextBtn.textContent = 'Back to roadmap →';
  }

  renderHeader();
}

document.getElementById('complete-btn').addEventListener('click', () => {
  const lesson = currentLesson();
  const k = key(mod.id, lesson.id);
  Store.update(s => {
    const i = s.completed.indexOf(k);
    if (i === -1) s.completed.push(k);
    else s.completed.splice(i, 1);
  });

  /* Advance automatically when marking complete, so the flow keeps moving. */
  const wasDone = state.completed.includes(k);
  const idx = mod.lessons.indexOf(lesson);
  const next = mod.lessons[idx + 1];
  if (!wasDone && next) {
    location.href = `lesson.html?module=${mod.id}&lesson=${next.id}`;
    return;
  }
  render();
});

initChrome();
render();
