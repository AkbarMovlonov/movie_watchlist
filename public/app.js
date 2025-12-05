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

const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const importStatus = document.getElementById('importStatus');


let users = [];
let currentUserId = null;
let watchedMovies = [];
let filterText = '';

// --- INIT ---

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
    try {
        const res = await fetch('/api/users');
        if (!res.ok) {
            throw new Error(`Failed to load users: ${res.status}`);
        }
        users = await res.json();
        userSelect.innerHTML = '';
        for (const u of users) {
            const opt = document.createElement('option');
            opt.value = String(u.id);
            opt.textContent = u.name;
            userSelect.appendChild(opt);
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadWatchedMovies() {
    if (!currentUserId) return;

    try {
        const res = await fetch(`/api/users/${currentUserId}/movies`);
        if (!res.ok) {
            console.error('Failed to load watched movies', res.status);
            watchedMovies = [];
            renderWatched();
            return;
        }
        watchedMovies = await res.json();
        if (!Array.isArray(watchedMovies)) {
            watchedMovies = [];
        }
        renderWatched();
    } catch (err) {
        console.error(err);
        watchedMovies = [];
        renderWatched();
    }
}

async function searchMovies(query) {
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
            searchResultsEl.textContent = 'Search failed.';
            return [];
        }
        const data = await res.json();
        return data.results || [];
    } catch (err) {
        console.error(err);
        searchResultsEl.textContent = 'Search failed.';
        return [];
    }
}

async function addMovieToWatched(movie) {
    const body = {
        external_id: movie.external_id,
        title: movie.title,
        poster_url: movie.poster_url,
        year: movie.year,
        type: movie.type || null
    };

    const res = await fetch(`/api/users/${currentUserId}/movies`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        alert('Failed to add');
        return;
    }

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
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'poster-placeholder';
            placeholder.textContent = '🎬';
            card.appendChild(placeholder);
        }


        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = m.title;
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'card-meta';
        const bits = [];
        if (m.year) bits.push(m.year);
        if (m.type) bits.push(m.type);
        meta.textContent = bits.join(' • ');
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
    const base = Array.isArray(watchedMovies) ? watchedMovies : [];
    let items = [...base];

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
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'poster-placeholder';
            placeholder.textContent = '🎬';
            card.appendChild(placeholder);
        }


        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = m.title;
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'card-meta';
        const bits = [];
        if (m.year) bits.push(m.year);
        if (m.type) bits.push(m.type);
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
    const res = await fetch(`/api/users/${currentUserId}/movies/${movieId}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        alert('Failed to remove');
        return;
    }
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
    manualError.textContent = '';

    if (!currentUserId) {
        manualError.textContent = 'Select a person first.';
        return;
    }

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

    const external_id = `manual-${Date.now()}`;
    const type = 'manual';

    await addMovieToWatched({ external_id, title, year, poster_url, type });

    manualTitle.value = '';
    manualYear.value = '';
    manualPosterUrl.value = '';
});

// --- EXPORT / IMPORT ---

exportBtn.addEventListener('click', async () => {
  importStatus.textContent = '';

  try {
    const res = await fetch('/api/export');
    if (!res.ok) {
      importStatus.textContent = 'Export failed.';
      return;
    }

    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    a.href = url;
    a.download = `movie_watchlist_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    importStatus.textContent = 'Exported successfully.';
  } catch (err) {
    console.error(err);
    importStatus.textContent = 'Export failed.';
  }
});

importBtn.addEventListener('click', async () => {
  importStatus.textContent = '';

  const file = importFile.files[0];
  if (!file) {
    importStatus.textContent = 'Choose a JSON file first.';
    return;
  }

  try {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      importStatus.textContent = 'Invalid JSON file.';
      return;
    }

    const res = await fetch('/api/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      importStatus.textContent = 'Import failed.';
      return;
    }

    const result = await res.json();
    if (result.status !== 'ok') {
      importStatus.textContent = 'Import failed.';
      return;
    }

    importStatus.textContent = 'Import successful. Reloading data...';

    // Reload users and movies
    await loadUsers();
    if (users.length > 0) {
      currentUserId = users[0].id;
      userSelect.value = String(currentUserId);
      await loadWatchedMovies();
    }
  } catch (err) {
    console.error(err);
    importStatus.textContent = 'Import failed.';
  }
});


// --- START ---
init();
