import * as signalR from '@microsoft/signalr';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { RobloxClient, senderId, sleep, normalizeCookie } from './core.mjs';

const log = message => console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
function settingsPrompt() {
  const result = spawnSync(join(import.meta.dirname, 'RequestDecliner-v2.exe'), ['--read-config'],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error('Open RequestDecliner-v2.exe and save your cookie first. The saved cookie must belong to this Windows account.');
  }
  try { return JSON.parse(result.stdout.trim()); }
  catch { throw new Error('Saved settings could not be read. Save them again in RequestDecliner-v2.exe.'); }
}

async function main() {
  console.log('Roblox Request Decliner\nUsing your saved cookie. Close this window or press Ctrl+C to stop.\n');
  const settings = settingsPrompt();
  if (!settings) { console.log('Cancelled.'); return; }
  const { detectOnly, includeExisting } = settings;
  if (!normalizeCookie(settings.cookie).toLowerCase().includes('warning:')) log('The supplied .ROBLOSECURITY value has no usual warning prefix. If you removed that prefix, copy the entire value again.');
  const api = new RobloxClient(settings.cookie);
  settings.cookie = '';
  log('Checking authentication with users.roblox.com (read-only)...');
  const me = await api.me();
  log(`Signed in as ${me.name} (${me.id}). Mode: ${detectOnly ? 'DETECT ONLY' : 'AUTO DECLINE'}.`);
  const ignored = includeExisting ? new Set() : await api.pending();
  if (ignored.size) log(`Leaving ${ignored.size} existing request(s) untouched.`);
  if (!detectOnly) await api.csrf();

  const active = new Set();
  const recent = new Map();
  let queue = Promise.resolve();
  function enqueue(id, source) {
    if (id === Number(me.id) || ignored.has(id) || active.has(id)) return;
    const now = Date.now();
    for (const [key, time] of recent) if (now - time > 5000) recent.delete(key);
    if (recent.has(id)) return;
    active.add(id);
    log(`Request from user ${id} (${source}).`);
    queue = queue.then(async () => {
      if (detectOnly) { log(`Detected ${id}; no decline sent.`); return; }
      const start = Date.now();
      await api.decline(id);
      log(`Declined ${id} (${Date.now() - start} ms for API call).`);
    }).then(() => recent.set(id, Date.now())).catch(error => {
      log(`Could not process ${id}: ${error.message} It remains pending; reconnect/restart to recheck.`);
    }).finally(() => active.delete(id));
  }
  let syncing = false;
  async function reconcile() {
    if (syncing) return;
    syncing = true;
    try {
      // Collect every page before declining so pagination isn't changed by us.
      const ids = await api.pending();
      for (const id of ignored) if (!ids.has(id)) ignored.delete(id);
      for (const id of ids) enqueue(id, 'pending check');
    } catch (error) { log(`Pending check failed: ${error.message}`); }
    finally { syncing = false; }
  }
  const connection = new signalR.HubConnectionBuilder()
    .withUrl('https://realtime-signalr.roblox.com/userhub', {
      transport: signalR.HttpTransportType.WebSockets,
      skipNegotiation: true,
      headers: { Cookie: api.cookie }
    })
    .configureLogging(signalR.LogLevel.None)
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: context => Math.min(30000, 1000 * 2 ** Math.min(context.previousRetryCount, 5)) })
    .build();
  connection.on('notification', (name, raw) => {
    const id = senderId(name, raw);
    if (id !== null) enqueue(id, 'live event');
  });
  connection.onreconnecting(() => log('Disconnected. Reconnecting; live detection is temporarily unavailable.'));
  connection.onreconnected(() => { log('Reconnected. Checking requests missed while offline.'); void reconcile(); });
  connection.onclose(() => log('Connection closed. Restart the program to resume.'));
  process.on('SIGINT', () => { console.log('\nStopped.'); process.exit(0); });
  for (let attempt = 0; ; attempt++) {
    try { await connection.start(); break; }
    catch {
      if (attempt >= 4) throw new Error('Could not connect to Roblox notifications after 5 attempts. The cookie or internal notification API may no longer be usable.');
      log('Notification connection failed. Retrying...');
      await sleep(Math.min(30000, 2000 * 2 ** attempt));
    }
  }
  log('Connected. Listening for requests; no periodic decline calls.');
  log('A connection alone does not prove event delivery: send a test request to verify.');
  await reconcile();
}

main().catch(error => { console.error(`Stopped: ${error.message}`); process.exit(1); });
