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
                 'experiencedDate', 'releaseDate', 'hallOfFame', 'legacy', 'note', 'body'];

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
      id: md5Hex(member + '|' + category + '|' + title + '|' + (experienced || '') + '|' + (released || '')),
      source: SOURCES[category], member: member, title: title,
      originalTitle: String(row.originalTitle || '').trim(), creator: String(row.creator || '').trim(),
      category: category, label: LABELS[category], rating: rating,
      ratingLabel: rating !== null ? rating + ' / 10' : '未評価', ratingScale: 10,
      hallOfFame: truthy(row.hallOfFame), legacy: truthy(row.legacy),
      sortDate: experienced || released,
      sortDateProperty: experienced ? '体験日' : 'リリース日',
      dateLabel: experienced ? 'EXPERIENCED ON' : 'RELEASED ON', sourceDatabase: null,
      experiencedDate: experienced, releaseDate: released, readingStartedDate: null,
      visitedDate: null, createdDate: null,
      tags: String(row.tags || '').replace(/、/g, ',').split(',').map(t => t.trim()).filter(Boolean),
      note: String(row.note || '').trim(), body: String(row.body || '').trim(),
      format: null, scores: {}, links: {},
      url: SpreadsheetApp.getActiveSpreadsheet().getUrl(), cover: null
    });
  }
  return entries;
}

function syncMemoriesToGitHub() {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('GITHUB_OWNER');
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');
  if (!owner || !repo || !token) throw new Error('Script Properties GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN are missing.');

  const entries = buildEntries();
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
