# ROBLOX Request Decliner
AI DISCLOSURE: This project was generated entirely by me using GPT-6 Astra.
A Windows utility that listens for ROBLOX friend-request notifications and optionally declines incoming requests.

## Setup

1. Extract the ZIP into a writable folder using the green Code button > Download ZIP.
2. Install [Node.js](https://nodejs.org/) version 22 or newer.
3. Open **RequestDecliner-v2.exe**. **Start.bat** also opens this app.

On first start, the listener downloads its locked dependencies using npm. Internet access is required. Keep all extracted files together.

## Usage

1. Paste your ROBLOSECURITY cookie into the masked field.
2. Optionally select Detect only or processing existing requests.
3. Click **Save and start**. A separate console shows the listener's connection and results.
4. Keep the listener console open. Close it or press Ctrl+C to stop. Closing the settings app alone does not stop the listener.

**Save cookie** stores the cookie and options in `saved-cookie.dat` beside the executable, encrypted using Windows DPAPI for your Windows account. The app reloads it on the next launch. **Forget cookie** removes the saved file; it does not revoke the ROBLOX session or stop an already running listener.

Keep the executable and other files together in this folder. The settings app runs on Windows .NET Framework; the listener requires Node.js 22 or newer. RunListener.bat installs the locked SignalR dependency if missing.

The listener reads the decrypted settings from the executable through a private process pipe. Credentials are not passed as command-line arguments or logged. CSRF tokens are fetched and refreshed automatically. The logout challenge never includes a CSRF token and is never retried with one.

## Behavior

- Listens for FriendshipNotifications / FriendshipRequested through ROBLOX's internal SignalR WebSocket service.
- Declines individual requests; never calls decline-all on a timer.
- Checks the pending list at connection and reconnection to catch requests missed while offline. In new-only mode, IDs present in the startup snapshot are excluded. Requests that arrive during this initial snapshot may also be excluded; a repeat request from an excluded sender stays excluded until a later check observes the original request gone.
- Processes requests serially and suppresses duplicate events for five seconds. Rate limits and server errors receive bounded retries. A failed request remains pending and is reported in the console; there is no periodic fallback sweep.
- The cookie may expire or be rejected by ROBLOX. Restart with a fresh cookie if needed.
- Detect-only mode sends no decline requests and does not fetch CSRF through logout.

## First live verification

Use detect-only mode, wait for Connected, and have another account send a friend request. A live-event log confirms the notification format works for your account. Then restart in automatic mode. If that test request remains pending, opt into processing existing requests or remove it manually before sending another.

Connected confirms the WebSocket handshake, not delivery of friend-request events. This uses an internal ROBLOX service that can change. If no event arrives, do not assume requests are being declined. End-to-end live authentication and notification delivery have not been confirmed. Offline tests do not establish compatibility with every ROBLOX account.

API duration in the log measures the decline call after receipt, not the time from the sender clicking Send.

## Tests and source references

Run `npm test` for offline tests of CSRF safety, token refresh, rate-limit handling, pagination, cookie validation, and notification filtering.

- https://noblox.js.org/lib_client_onNotification.js.html
- https://noblox.js.org/lib_friends_onFriendRequest.js.html
- https://noblox.js.org/lib_util_getGeneralToken.js.html
- https://noblox.js.org/lib_friends_declineFriendRequest.js.html
- https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client

## Authentication input

Supply the entire .ROBLOSECURITY value, including its warning text if present. A single-line Cookie header containing .ROBLOSECURITY is also accepted. If .RBXID is supplied alongside it, it is sent under its own name; unrelated cookies are omitted. .RBXID alone cannot substitute for .ROBLOSECURITY. A 401 identifies rejection by a particular endpoint, not a confirmed expiration.

## Building and contributing

The C# source for the settings app is included. Run `Build.bat` on Windows to rebuild `RequestDecliner-v2.exe` using the .NET Framework compiler. Close the settings app before rebuilding it.

Run `npm ci --ignore-scripts` followed by `npm test` to install dependencies and run the offline tests.

## Publishing on GitHub

Upload the extracted project files, including `.gitignore`, or attach this ZIP to a GitHub release. Each user supplies their own cookie. Never commit `saved-cookie.dat`, even though it is encrypted. It is generated locally and excluded by `.gitignore`. Installed dependencies are also excluded; the lockfile is included for reproducible installation.
