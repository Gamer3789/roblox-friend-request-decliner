export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function normalizeCookie(value) {
  value = value.trim();
  if (/\r|\n/.test(value)) throw new Error('Cookie input must be a single line.');
  value = value.replace(/^Cookie:\s*/i, '');
  if (/^(?:\.ROBLOSECURITY|\.RBXID)=/i.test(value) || value.includes(';')) {
    const pairs = value.split(';').map(part => part.trim());
    const security = pairs.filter(part => /^\.ROBLOSECURITY=/i.test(part));
    if (security.length !== 1) throw new Error('A named Cookie header must contain exactly one .ROBLOSECURITY value. .RBXID alone cannot replace it.');
    value = security[0].slice('.ROBLOSECURITY='.length);
  }
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!value || /[\s;\r\n]/.test(value)) throw new Error('Cookie value is empty or contains whitespace. Copy the full .ROBLOSECURITY value, including its warning prefix.');
  return value;
}

export function cookieHeader(input) {
  const security = normalizeCookie(input);
  const parts = input.trim().replace(/^Cookie:\s*/i, '').split(';').map(part => part.trim());
  const rbxid = parts.find(part => /^\.RBXID=/i.test(part));
  if (rbxid && /[\s\r\n]/.test(rbxid)) throw new Error('The .RBXID cookie contains whitespace.');
  return `.ROBLOSECURITY=${security}${rbxid ? '; ' + rbxid : ''}`;
}

export function senderId(name, raw) {
  if (name !== 'FriendshipNotifications') return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const id = Number(data?.EventArgs?.UserId1);
    return data?.Type === 'FriendshipRequested' && Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}

export class RobloxClient {
  constructor(cookie, fetcher = fetch, wait = sleep) {
    this.cookie = cookieHeader(cookie);
    this.fetcher = fetcher;
    this.wait = wait;
    this.token = null;
  }
  async raw(url, method = 'GET', token = null) {
    try {
      return await this.fetcher(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Cookie: this.cookie, ...(token ? { 'X-CSRF-TOKEN': token } : {}) }
      });
    } catch { throw new Error('Network request failed or timed out.'); }
  }
  async csrf() {
    // Deliberately bypass the retry helper: NEVER authorize or retry logout.
    const response = await this.raw('https://auth.roblox.com/v2/logout', 'POST');
    const token = response.headers.get('x-csrf-token');
    if (response.status !== 403 || !token) throw new Error(`Could not obtain CSRF token (HTTP ${response.status}). Check the cookie.`);
    this.token = token;
  }
  async request(url, method = 'GET') {
    if (method === 'POST' && !this.token) await this.csrf();
    let refreshed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.raw(url, method, method === 'POST' ? this.token : null);
      if (res.ok) return res;
      if (res.status === 401) throw new Error(`Roblox rejected authentication (HTTP 401) at ${new URL(url).hostname}${new URL(url).pathname}. This does not prove expiration. Supply the complete .ROBLOSECURITY value, including its warning prefix; .RBXID alone is not a substitute.`);
      if (res.status === 403 && method === 'POST' && !refreshed) {
        const replacement = res.headers.get('x-csrf-token');
        if (!replacement) throw new Error('HTTP 403 without a CSRF challenge; request denied.');
        this.token = replacement;
        refreshed = true;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const header = res.headers.get('retry-after');
        const seconds = header ? Number(header) : NaN;
        const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : NaN;
        await this.wait(Math.max(1000, Number.isFinite(delay) ? delay : 2000 * 2 ** attempt));
        continue;
      }
      throw new Error(`Roblox returned HTTP ${res.status}.`);
    }
    throw new Error('Retry limit reached.');
  }
  async me() {
    return (await this.request('https://users.roblox.com/v1/users/authenticated')).json();
  }
  async pending() {
    const ids = new Set();
    const cursors = new Set();
    let cursor = '';
    do {
      const url = new URL('https://friends.roblox.com/v1/my/friends/requests');
      url.searchParams.set('limit', '100');
      url.searchParams.set('sortOrder', 'Asc');
      if (cursor) url.searchParams.set('cursor', cursor);
      const page = await (await this.request(url.href)).json();
      if (!Array.isArray(page.data)) throw new Error('Unexpected friend-request list format.');
      for (const entry of page.data) {
        const id = Number(entry.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Unexpected friend-request user ID.');
        ids.add(id);
      }
      cursor = page.nextPageCursor;
      if (cursor && cursors.has(cursor)) throw new Error('Repeated pagination cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return ids;
  }
  async decline(id) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid sender ID.');
    await this.request(`https://friends.roblox.com/v1/users/${id}/decline-friend-request`, 'POST');
  }
}
