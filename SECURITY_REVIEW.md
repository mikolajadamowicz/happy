# Security & Architecture Review

## 1. Server Security Assessment

### What is stored on the server and why?

The server (PostgreSQL database) stores the following data:

| Data | Encrypted? | By whom? | Purpose |
|------|-----------|----------|---------|
| Session metadata (path, host, OS, summary) | End-to-end encrypted | Client | Sync session info between CLI and mobile app |
| Session messages (all chat content) | End-to-end encrypted | Client | Persist and sync conversation history |
| Agent state (permission requests, mode) | End-to-end encrypted | Client | Sync agent control state |
| Machine metadata (hostname, platform) | End-to-end encrypted | Client | Display machine info in mobile app |
| Daemon state (pid, port, status) | End-to-end encrypted | Client | Monitor daemon from mobile |
| Artifacts (header + body) | End-to-end encrypted | Client | Store and sync code artifacts |
| KV store values | End-to-end encrypted | Client | Encrypted user preferences |
| Access keys | End-to-end encrypted | Client | Per-session per-machine access |
| GitHub OAuth tokens | Server-side encrypted | Server (KeyTree) | GitHub integration |
| Vendor API tokens (OpenAI, Anthropic, Gemini) | Server-side encrypted | Server (KeyTree) | AI vendor integration |
| Account public key | Not encrypted (identifier) | N/A | Account identity |
| Push notification tokens | Not encrypted | N/A | Send push notifications |
| User profile (name, username, avatar) | Not encrypted | N/A | Social/display features |
| Session IDs, timestamps, sequence numbers | Not encrypted | N/A | Ordering and indexing |

### Is the server safe?

**The core security model is solid.** The design follows a zero-knowledge architecture for user content:

**Strengths:**
- **End-to-end encryption for all sensitive data.** Session metadata, messages, agent state, machine state, artifacts, and KV values are all encrypted on the client before reaching the server. The server stores them as opaque base64 blobs and never decrypts them.
- **No passwords stored.** Authentication uses public-key cryptography (Ed25519 challenge-response via TweetNaCl). The server only stores public keys.
- **Verified server-side decrypt scope.** Grepping for `decrypt` in the server code confirms decryption is only used for vendor service tokens (`connectRoutes.ts:290,329`) - never for user session data.
- **Two encryption variants.** Legacy (XSalsa20-Poly1305 via TweetNaCl secretbox) and modern (AES-256-GCM with per-session data keys). Both are industry-standard authenticated encryption algorithms.
- **Per-session/per-machine data keys.** The dataKey variant generates unique encryption keys per session, wrapped with an ephemeral keypair.
- **Serializable transaction isolation.** Database writes use serializable isolation with automatic retry on serialization conflicts.
- **Token-based auth with `privacy-kit`.** Bearer tokens are cryptographically generated and verified, not JWT (which has known footgun issues).

**Concerns and weaknesses:**

| Severity | Issue | Location | Impact |
|----------|-------|----------|--------|
| Critical | **CORS open to all origins** (`origin: '*'`) | `api.ts`, `socket.ts` | Any website can make API requests; combined with token auth, enables cross-site attacks |
| Critical | **Token cache never expires** | `auth.ts:102-103` | Compromised tokens valid forever; memory grows unboundedly |
| High | **`HANDY_MASTER_SECRET` is a single point of failure** | `encrypt.ts`, `auth.ts` | If leaked: all vendor tokens, auth tokens, and server-side encrypted data compromised |
| High | **Path traversal - symlink risk** | `api.ts:61-74` | File serving checks `startsWith(baseDir)` but doesn't guard against symlinks |
| Medium | **No rate limiting** | Auth routes, Socket.IO | Brute-force and denial-of-service attacks possible |
| Medium | **Webhook body accepts `z.any()`** | `connectRoutes.ts` | DoS risk via large payloads (only limited by 100MB Fastify body limit) |
| Medium | **User IDs leaked in error messages** | `voiceRoutes.ts:98` | Information disclosure (minor, CUIDs not sensitive, but violates least-privilege) |
| Low | **Server test coverage is low** | Server package | Only 5 test files for entire server |
| Low | **Dev logging flag** | `.env.dev` | `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING` logs user IDs and operation details |

**Details on critical issues:**

1. **CORS `origin: '*'`** - Both the Fastify HTTP server and the Socket.IO server allow requests from any origin. While the app uses Bearer tokens (not cookies), this still broadens the attack surface unnecessarily and could enable token theft via XSS on any domain.

2. **Token cache never expires** - The comment in `auth.ts` says "tokens are cached forever as requested." There is no TTL, no eviction, and no true revocation mechanism. A compromised token grants indefinite access until the server restarts.

### Can a third-party server operator read your data?

**For session data, messages, agent state, and artifacts: NO.**

These are end-to-end encrypted on the client. The server only sees opaque base64 blobs. A malicious server operator cannot read:
- Your code or conversation content
- Session metadata (working directory, hostname, etc.)
- Agent permission requests/responses
- Machine metadata or daemon state
- Artifacts
- KV store values

**For vendor API tokens (GitHub, OpenAI, Anthropic, Gemini): YES.**

These are encrypted server-side using `HANDY_MASTER_SECRET`. A server operator who controls the server process has access to this secret and can decrypt these tokens.

**For non-encrypted metadata: YES.**

A server operator can see:
- Your account public key
- Push notification tokens
- Profile information (name, username, avatar) if you set them
- Session IDs, timestamps, and which sessions are active
- IP addresses from connection logs
- Usage reports and sequence numbers

**Recommendation:** If you use a third-party server, **do not** connect GitHub or store vendor API tokens through the server. Your actual coding data (sessions, messages, code) remains protected by E2E encryption regardless.

---

## 2. Mobile App Technology

The mobile app is written in **React Native with Expo SDK 54**, targeting:
- **iOS** (App Store)
- **Android** (Google Play)
- **Web** (app.happy.engineering)
- **macOS Desktop** (via Tauri)

### Key technology stack:
- **React Native** 0.81.4 + **React** 19.1.0
- **Expo Router** v6 (file-based routing)
- **TypeScript** (strict typing throughout)
- **Zustand** (state management)
- **Unistyles** (cross-platform theming)
- **libsodium / rn-encryption** (client-side E2E encryption)
- **Socket.IO** (real-time WebSocket sync)
- **LiveKit** (voice communication)
- **React Native MMKV** (local storage)
- **Expo Camera** (QR code scanning)
- **i18n** (9 languages: en, ru, pl, es, ca, it, pt, ja, zh-Hans)

---

## 3. Mobile App Code Quality

### Strengths:
- **Strong type safety.** TypeScript is used throughout with strict types. Interface definitions are thorough (see `ops.ts` with ~30 strictly typed RPC interfaces). Zod schemas validate wire protocol data.
- **Well-structured architecture.** Clear separation of concerns: `sync/` handles data synchronization, `encryption/` handles crypto, `components/` for UI, `auth/` for authentication, `realtime/` for WebSocket management.
- **Encryption done properly.** The app implements AES-256-GCM and NaCl box encryption natively using `rn-encryption` and `react-native-libsodium`. Keys stay on-device.
- **Concurrency handling.** AsyncLock, InvalidateSync, and AbortController patterns prevent race conditions in the sync engine.
- **Reducer-based state management.** The sync engine uses reducers with clear action types for predictable state transitions.
- **Internationalization.** Full i18n support with 9 languages from the start.
- **Cross-platform.** Single codebase targets iOS, Android, Web, and macOS with platform-specific overrides where needed (e.g., `base64.native.ts` vs `base64.ts`, `Shaker.web.tsx`).

### Weaknesses:
- **Large sync class.** `sync.ts` has a `Sync` class that is quite large with many responsibilities and maps (15+ private fields). This could be split into smaller focused modules.
- **Test coverage is moderate.** 29 test/spec files across 403 source files (~7% file coverage). Critical paths like encryption have tests (`aes.appspec.ts`, `deriveKey.appspec.ts`), but many UI components and the sync engine lack tests.
- **Some naming inconsistencies.** Mix of `typesRaw.ts`, `typesMessage.ts`, `apiTypes.ts`, and `storageTypes.ts` - the naming convention for type files varies.
- **File named `modeHacks.ts`** suggests workarounds that may accumulate technical debt.

### Additional weaknesses (from deep analysis):
- **Silent failures in decryption.** Many crypto operations return `null` on failure and log to `console.error()` without notifying the user. Critical operations should surface errors.
- **No RPC timeouts on socket calls.** `emitWithAck` calls can hang indefinitely without timeout protection.
- **Web credential storage is insecure.** On web, auth tokens are stored in `localStorage` (vulnerable to XSS). Native platforms correctly use `expo-secure-store`.
- **Large components.** `AgentInput.tsx` (1,214 lines) and `NewSessionWizard.tsx` (1,917 lines) need splitting.
- **400+ console statements** in production code (many gated behind DEBUG flags, but not all).
- **No key rotation mechanism** visible for E2E encryption keys.

### Overall assessment:
The code quality is **above average for a React Native project** (~7.5/10). The architecture is thoughtful with clear module boundaries, encryption is handled correctly at a low level, and TypeScript provides strong guardrails. The main areas for improvement are test coverage, the size of the core sync engine class, and the web platform's credential storage.

---

## 4. Summary: Can You Safely Use a Third-Party Server?

| Concern | Risk level | Explanation |
|---------|-----------|-------------|
| They read your code/conversations | **None** | End-to-end encrypted; server sees only opaque blobs |
| They read session metadata | **None** | End-to-end encrypted |
| They read your vendor API keys | **High** | Server-side encrypted with a key the operator controls |
| They see your profile info | **Medium** | Name, username, avatar stored in plaintext |
| They see connection metadata | **Medium** | IPs, timestamps, session activity patterns |
| They tamper with messages | **Low** | Authenticated encryption (GCM/Poly1305) would detect tampering |
| They deny service | **Medium** | Could drop messages or refuse connections |

**Bottom line:** A third-party server **cannot read your code, conversations, or session data** due to end-to-end encryption. However, they **can** read any vendor API tokens you store through the server, see your profile information, and observe connection patterns. If you avoid storing vendor tokens on a third-party server, your sensitive data remains protected.
