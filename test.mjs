import test from 'node:test';
import assert from 'node:assert/strict';
import { RobloxClient, senderId, normalizeCookie, cookieHeader } from './core.mjs';

const reply = (status, headers = {}, data = {}) => new Response(JSON.stringify(data), { status, headers });
test('logout challenge never includes or retries with a CSRF token', async () => {
  const calls = [];
  const api = new RobloxClient('dummy', async (url, options) => {
    calls.push({ url, options });
    return reply(403, { 'x-csrf-token': 'fresh' });
  });
  api.token = 'old';
  await api.csrf();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://auth.roblox.com/v2/logout');
  assert.equal(calls[0].options.headers['X-CSRF-TOKEN'], undefined);
  assert.equal(api.token, 'fresh');
});
test('unexpected logout response fails closed without retry', async () => {
  let count = 0;
  const api = new RobloxClient('dummy', async () => { count++; return reply(200); });
  await assert.rejects(api.csrf(), /Could not obtain/);
  assert.equal(count, 1);
});
test('decline refreshes a challenged token exactly once', async () => {
  const seen = [];
  const api = new RobloxClient('dummy', async (url, options) => {
    seen.push(options.headers['X-CSRF-TOKEN']);
    return seen.length === 1 ? reply(403, { 'x-csrf-token': 'replacement' }) : reply(200);
  });
  api.token = 'expired';
  await api.decline(123);
  assert.deepEqual(seen, ['expired', 'replacement']);
});
test('repeated CSRF denial and non-CSRF denial stop', async () => {
  for (const headers of [{}, { 'x-csrf-token': 'denied' }]) {
    let count = 0;
    const api = new RobloxClient('dummy', async () => { count++; return reply(403, headers); });
    api.token = 'old';
    await assert.rejects(api.decline(123));
    assert.equal(count, headers['x-csrf-token'] ? 2 : 1);
  }
});
test('429 respects Retry-After before retrying', async () => {
  const waits = [];
  let count = 0;
  const api = new RobloxClient('dummy', async () => ++count === 1 ? reply(429, { 'retry-after': '12' }) : reply(200), async ms => waits.push(ms));
  api.token = 'token';
  await api.decline(123);
  assert.deepEqual(waits, [12000]);
});
test('only incoming request events with valid IDs are accepted', () => {
  const data = { Type: 'FriendshipRequested', EventArgs: { UserId1: 123 } };
  assert.equal(senderId('FriendshipNotifications', JSON.stringify(data)), 123);
  assert.equal(senderId('Other', data), null);
  assert.equal(senderId('FriendshipNotifications', '{'), null);
  assert.equal(senderId('FriendshipNotifications', { ...data, Type: 'FriendshipAccepted' }), null);
  assert.equal(senderId('FriendshipNotifications', { ...data, EventArgs: { UserId1: -1 } }), null);
});
test('pending lookup traverses pages without posting', async () => {
  const calls = [];
  const api = new RobloxClient('dummy', async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? reply(200, {}, { data: [{ id: 1 }], nextPageCursor: 'next' }) : reply(200, {}, { data: [{ id: 2 }], nextPageCursor: null });
  });
  assert.deepEqual([...await api.pending()], [1, 2]);
  assert.equal(new URL(calls[1].url).searchParams.get('cursor'), 'next');
  assert.ok(calls.every(call => call.options.method === 'GET'));
});
test('cookie input rejects header injection', () => {
  assert.equal(normalizeCookie('.ROBLOSECURITY=dummy'), 'dummy');
  assert.throws(() => normalizeCookie('dummy; second=value'));
  assert.throws(() => normalizeCookie('dummy\r\nHeader:value'));
});

test('named cookie headers preserve security value and optional RBXID', () => {
  assert.equal(cookieHeader('Cookie: .RBXID=optional; .ROBLOSECURITY=full-warning-value; other=ignored'), '.ROBLOSECURITY=full-warning-value; .RBXID=optional');
  assert.equal(cookieHeader('.ROBLOSECURITY="dummy";'), '.ROBLOSECURITY=dummy');
  assert.throws(() => cookieHeader('.RBXID=not-security'), /cannot replace/);
  assert.throws(() => cookieHeader('.ROBLOSECURITY=a; .ROBLOSECURITY=b'), /exactly one/);
});

test('401 identifies endpoint without falsely claiming expiration or exposing cookie', async () => {
  const api = new RobloxClient('private-value', async () => reply(401));
  await assert.rejects(api.me(), error => error.message.includes('users.roblox.com/v1/users/authenticated') && !error.message.includes('private-value') && !error.message.includes('Authentication expired'));
});
