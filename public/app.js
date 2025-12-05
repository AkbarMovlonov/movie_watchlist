const userSelect = document.getElementById('userSelect');
const sortSelect = document.getElementById('sortSelect');
const watchedFilterInput = document.getElementById('watchedFilter');

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResultsEl = document.getElementById('searchResults');
const watchedGridEl = document.getElementById('watchedGrid');

const manualTitle = document.getElementById('manualTitle');
const manualYear = document.getElementById('manualYear');
const manualPosterUrl = document.getElementById('manualPosterUrl');
const manualAddBtn = document.getElementById('manualAddBtn');
const manualError = document.getElementById('manualError');


let users = [];
let currentUserId = null;
let watchedMovies = []; // full list from server
let filterText = '';

async function init() {
  await loadUsers();
  if (users.length > 0) {
    currentUserId = users[0].id;
    userSelect.value = String(currentUserId);
    await loadWatchedMovies();
  }
}

// --- API HELPERS ---

async function loadUsers() {
  const res = await fetch('/api/users');
  users = await res.json();
  userSelect.innerHTML = '';
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = String(u.id);
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  }
}

async function loadWatchedMovies() {
  if (!currentUserId) return;
  const res = await fetch(`/api/users/${currentUserId}/movies`);
  watchedMovies = await res.json();
  renderWatched();
}

async function searchMovies(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.results || [];
}

async function addMovieToWatched(movie) {
  const body = {
    external_id: movie.external_id,
    title: movie.title,
    poster_url: movie.poster_url,
    year: movie.year
  };

  const res = await fetch(`/api/users/${currentUserId}/movies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (data.status === 'exists') {
    alert('Already in watched list');
    return;
  }

  await loadWatchedMovies();
}

// --- RENDERING ---

function renderSearchResults(results) {
  searchResultsEl.innerHTML = '';

  if (!results.length) {
    searchResultsEl.textContent = 'No results.';
    return;
  }

  for (const m of results) {
    const card = document.createElement('div');
    card.className = 'card';

    if (m.poster_url) {
      const img = document.createElement('img');
      img.src = m.poster_url;
      img.alt = m.title;
      card.appendChild(img);
    }

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = m.title;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = m.year ? m.year : '';
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add to watched';
    addBtn.addEventListener('click', () => addMovieToWatched(m));

    actions.appendChild(addBtn);
    card.appendChild(actions);

    searchResultsEl.appendChild(card);
  }
}

function getSortedWatched() {
  let items = [...watchedMovies];

  // Filter
  const q = filterText.trim().toLowerCase();
  if (q) {
    items = items.filter(m => m.title.toLowerCase().includes(q));
  }

  // Sort
  const sortBy = sortSelect.value;
  if (sortBy === 'title') {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'year') {
    items.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else {
    // added: sort by added_at (newest first)
    items.sort((a, b) => {
      const da = new Date(a.added_at).getTime();
      const db = new Date(b.added_at).getTime();
      return db - da;
    });
  }

  return items;
}

function renderWatched() {
  watchedGridEl.innerHTML = '';
  const items = getSortedWatched();

  if (!items.length) {
    watchedGridEl.textContent = 'No movies yet.';
    return;
  }

  for (const m of items) {
    const card = document.createElement('div');
    card.className = 'card';

    if (m.poster_url) {
      const img = document.createElement('img');
      img.src = m.poster_url;
      img.alt = m.title;
      card.appendChild(img);
    }

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = m.title;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const bits = [];
    if (m.year) bits.push(m.year);
    if (m.added_at) bits.push(`added ${new Date(m.added_at).toLocaleDateString()}`);
    meta.textContent = bits.join(' • ');
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = `#${m.id}`;
    actions.appendChild(badge);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => handleRemove(m.id));
    actions.appendChild(removeBtn);

    card.appendChild(actions);
    watchedGridEl.appendChild(card);
  }
}

async function handleRemove(movieId) {
  if (!confirm('Remove this movie?')) return;
  await fetch(`/api/users/${currentUserId}/movies/${movieId}`, {
    method: 'DELETE'
  });
  await loadWatchedMovies();
}

// --- EVENT LISTENERS ---

userSelect.addEventListener('change', async () => {
  currentUserId = Number(userSelect.value);
  await loadWatchedMovies();
});

sortSelect.addEventListener('change', () => {
  renderWatched();
});

watchedFilterInput.addEventListener('input', e => {
  filterText = e.target.value;
  renderWatched();
});

searchBtn.addEventListener('click', async () => {
  const q = searchInput.value.trim();
  if (!q) return;
  searchResultsEl.textContent = 'Searching...';
  const results = await searchMovies(q);
  renderSearchResults(results);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    searchBtn.click();
  }
});

manualAddBtn.addEventListener('click', async () => {
  if (!currentUserId || !currentPassword) {
    manualError.textContent = 'You must be logged in.';
    return;
  }

  manualError.textContent = '';

  const title = manualTitle.value.trim();
  if (!title) {
    manualError.textContent = 'Title is required.';
    return;
  }

  const yearText = manualYear.value.trim();
  const year = yearText ? Number(yearText) : null;
  if (yearText && Number.isNaN(year)) {
    manualError.textContent = 'Year must be a number.';
    return;
  }

  const poster_url = manualPosterUrl.value.trim() || null;

  // Use negative ID so it never collides with real TVMaze IDs (which are positive)
  const external_id = -Date.now();

  await addMovieToWatched({ external_id, title, year, poster_url });

  // Clear fields after successful add
  manualTitle.value = '';
  manualYear.value = '';
  manualPosterUrl.value = '';
});


// --- INIT ---
init();
