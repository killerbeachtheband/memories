/**
 * Killer Beach MEMORIES — sheet-to-site sync (Apps Script).
 *
 * The log sheet stays private. This script runs inside the sheet
 * (Extensions > Apps Script) and pushes a regenerated data.js to the
 * band's GitHub repository, which republishes the site via Actions.
 *
 * Setup (once, by the sheet owner):
 *  1. Project Settings > Script Properties, add:
 *       GITHUB_OWNER  e.g. killerbeach-theband
 *       GITHUB_REPO   e.g. memories
 *       GITHUB_TOKEN  fine-grained PAT for that repo (Contents: write only)
 *     Never paste the token into this code.
 *  2. Run setupTrigger() once to install the hourly trigger,
 *     or use the "MEMORIES" menu > "今すぐサイトに反映" manually.
 */

const SOURCES = { '映画': 'movies', '音楽': 'music', 'アート': 'art', '舞台・ライブ': 'live',
                  'ゲーム': 'games', '建築': 'arch', '本': 'books', 'その他': 'other' };
const LABELS = { '映画': 'CINEMA', '本': 'LITERATURE', '音楽': 'MUSIC', 'アート': 'ART',
                 '舞台・ライブ': 'LIVE', 'ゲーム': 'GAMES', '建築': 'ARCHITECTURE', 'その他': 'OTHER' };
const COLUMNS = ['member', 'category', 'title', 'originalTitle', 'creator', 'rating', 'tags',
                 'experiencedDate', 'releaseDate', 'hallOfFame', 'formative', 'note', 'body', 'cover'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('MEMORIES')
    .addItem('今すぐサイトに反映', 'syncMemoriesToGitHub')
    .addToUi();
}

function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncMemoriesToGitHub')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncMemoriesToGitHub').timeBased().everyHours(1).create();
}

function truthy(v) {
  return ['true', '1', 'yes', 'y', 'はい', '○'].includes(String(v || '').trim().toLowerCase());
}

function md5Hex(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function buildEntries() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('entries');
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(h => String(h).trim());
  const idx = {};
  COLUMNS.forEach(c => { idx[c] = header.indexOf(c); });
  const entries = [];
  for (let r = 1; r < values.length; r++) {
    const row = {};
    COLUMNS.forEach(c => { row[c] = idx[c] >= 0 ? values[r][idx[c]] : ''; });
    const title = String(row.title || '').trim();
    if (!title) continue;
    const category = String(row.category || 'その他').trim() || 'その他';
    if (!(category in SOURCES)) throw new Error('Unknown category: ' + category);
    const member = String(row.member || '').trim();
    const fmtDate = v => {
      if (!v) return null;
      if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
      return String(v).trim() || null;
    };
    const experienced = fmtDate(row.experiencedDate);
    const released = fmtDate(row.releaseDate);
    let rating = null;
    if (row.rating !== '' && row.rating !== null && row.rating !== undefined) {
      rating = Number(row.rating);
      if (isNaN(rating) || rating < 0 || rating > 10) throw new Error('Invalid rating for ' + title);
      if (Number.isInteger(rating)) rating = Math.floor(rating);
    }
    entries.push({
      _row: r + 1,
      id: md5Hex(member + '|' + category + '|' + title + '|' + (experienced || '') + '|' + (released || '')),
      source: SOURCES[category], member: member, title: title,
      originalTitle: String(row.originalTitle || '').trim(), creator: String(row.creator || '').trim(),
      category: category, label: LABELS[category], rating: rating,
      ratingLabel: rating !== null ? rating + ' / 10' : '未評価', ratingScale: 10,
      hallOfFame: truthy(row.hallOfFame), formative: truthy(row.formative),
      sortDate: experienced || released,
      sortDateProperty: experienced ? '体験日' : 'リリース日',
      dateLabel: experienced ? 'EXPERIENCED ON' : 'RELEASED ON', sourceDatabase: null,
      experiencedDate: experienced, releaseDate: released, readingStartedDate: null,
      visitedDate: null, createdDate: null,
      tags: String(row.tags || '').replace(/、/g, ',').split(',').map(t => t.trim()).filter(Boolean),
      note: String(row.note || '').trim(), body: String(row.body || '').trim(),
      format: null, scores: {}, links: {},
      url: null,
      cover: String(row.cover || '').trim() || null
    });
  }
  return entries;
}

/** ---------- automatic cover art ---------- */

function githubHeaders(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
}

function githubFileSha(owner, repo, token, path) {
  const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path + '?ref=main';
  const res = UrlFetchApp.fetch(url, { headers: githubHeaders(token), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  try { return JSON.parse(res.getContentText()).sha || null; } catch (e) { return null; }
}

function githubUpload(owner, repo, token, path, bytes, message, sha) {
  const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;
  const payload = { message: message, content: Utilities.base64Encode(bytes), branch: 'main' };
  if (sha) payload.sha = sha;
  const res = UrlFetchApp.fetch(url, { method: 'put', headers: githubHeaders(token),
    contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('GitHub image upload failed: ' + res.getResponseCode());
}

function normalizeTitle(s) {
  return String(s || '').toLowerCase().replace(/[\s　・:：/／\-—–'"“”‘’()（）\[\]【】]/g, '');
}

function cleanTitle(title) {
  let t = String(title || '').trim();
  // Drop leading bracketed annotations such as （記入例） or 【限定盤】.
  let prev;
  do { prev = t; t = t.replace(/^\s*[（(【\[][^）)】\]]*[）)】\]]\s*/, ''); } while (t !== prev);
  return t.trim();
}

function findArtworkUrl(entry) {
  const title = cleanTitle(entry.title);
  const terms = [];
  if (entry.creator) terms.push(title + ' ' + entry.creator);
  terms.push(title);
  if (entry.originalTitle && entry.originalTitle !== entry.title) {
    terms.push(cleanTitle(entry.originalTitle) + ' ' + (entry.creator || ''));
  }
  const wantTitle = normalizeTitle(title);
  const wantCreator = normalizeTitle(entry.creator || '');
  try {
    if (entry.source === 'music' || entry.source === 'movies') {
      const media = entry.source === 'music' ? 'music' : 'movie';
      const entity = entry.source === 'music' ? 'album' : 'movie';
      let firstArtwork = null;
      for (const term of terms) {
        for (const country of ['JP', 'US']) {
          const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term) +
                      '&media=' + media + '&entity=' + entity + '&limit=5&country=' + country;
          const data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
          for (const r of (data.results || [])) {
            if (!r.artworkUrl100) continue;
            const art = r.artworkUrl100.replace('100x100bb.jpg', '1200x1200bb.jpg');
            if (!firstArtwork) firstArtwork = art;
            const name = normalizeTitle(r.collectionName || r.trackName || '');
            const artist = normalizeTitle(r.artistName || '');
            if (name && (name.includes(wantTitle) || wantTitle.includes(name))) return art;
            if (wantCreator && artist && (artist.includes(wantCreator) || wantCreator.includes(artist))) return art;
          }
        }
      }
      if (firstArtwork) Logger.log('Cover (best match): ' + entry.title + ' -> ' + firstArtwork);
      return firstArtwork;
    }
    if (entry.source === 'books') {
      const q = encodeURIComponent('intitle:' + title);
      const url = 'https://www.googleapis.com/books/v1/volumes?q=' + q + '&maxResults=3';
      const data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      for (const item of (data.items || [])) {
        const links = (item.volumeInfo || {}).imageLinks || {};
        if (links.thumbnail) return links.thumbnail.replace('http://', 'https://');
      }
    }
  } catch (e) { Logger.log('Artwork lookup failed for ' + entry.title + ': ' + e); }
  Logger.log('No cover found for: ' + entry.title);
  return null;
}

/**
 * Fill empty covers: a cover cell holding an http(s) URL is treated as a
 * manual choice and downloaded; an empty cell triggers an artwork search
 * (music / movies via iTunes, books via Google Books; other categories keep
 * the typographic cover). Resolved covers are uploaded to the repo and the
 * resulting path is written back into the sheet, so members can override by
 * replacing the cell with another URL or path.
 */
function resolveCovers(entries, sheet, coverCol, gh) {
  let fetched = 0;
  entries.forEach((entry, i) => {
    const cell = entry.cover || '';
    if (cell.startsWith('assets/')) return;
    if (fetched >= 20) return; // stay well inside fetch quotas; the hourly run catches up
    const sourceUrl = cell.startsWith('http') ? cell : findArtworkUrl(entry);
    if (!sourceUrl) return;
    const path = 'assets/covers/' + entry.id + '.jpg';
    try {
      const sha = githubFileSha(gh.owner, gh.repo, gh.token, path);
      if (!sha || cell.startsWith('http')) {
        const img = UrlFetchApp.fetch(sourceUrl, { muteHttpExceptions: true });
        if (img.getResponseCode() !== 200) return;
        githubUpload(gh.owner, gh.repo, gh.token, path, img.getBlob().getBytes(), 'Add cover for ' + entry.title, sha);
      }
      entry.cover = path;
      sheet.getRange(entry._row, coverCol + 1).setValue(path);
      fetched++;
    } catch (e) { /* leave the typographic cover on failure */ }
  });
}

function syncMemoriesToGitHub() {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('GITHUB_OWNER');
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');
  if (!owner || !repo || !token) throw new Error('Script Properties GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN are missing.');

  const entries = buildEntries();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('entries');
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  resolveCovers(entries, sheet, header.indexOf('cover'), { owner: owner, repo: repo, token: token });
  entries.forEach(e => { delete e._row; });
  if (!entries.length) throw new Error('No rows found; site left unchanged.');
  const now = new Date();
  const archive = {
    snapshotDate: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy.MM.dd'),
    snapshotAt: now.toISOString(),
    entries: entries
  };
  const content = 'const ARCHIVE = ' + JSON.stringify(archive) + ';\n';

  const api = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/data.js';
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const current = UrlFetchApp.fetch(api + '?ref=main', { headers: headers, muteHttpExceptions: true });
  const payload = { message: 'Update snapshot from sheet', content: Utilities.base64Encode(content, Utilities.Charset.UTF_8), branch: 'main' };
  if (current.getResponseCode() === 200) payload.sha = JSON.parse(current.getContentText()).sha;
  const res = UrlFetchApp.fetch(api, { method: 'put', headers: headers, contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('GitHub update failed: ' + res.getResponseCode() + ' ' + res.getContentText());
  Logger.log('Pushed ' + entries.length + ' records to ' + owner + '/' + repo + '.');
}
