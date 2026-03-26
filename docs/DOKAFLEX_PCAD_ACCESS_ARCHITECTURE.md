# Dokaflex + PCAD Access Control Architecture

Date: 2026-03-08
Status: Working implementation spec
Owner: Architect/reviewer

## Purpose

This document defines the target access-control architecture for:
- the Dokaflex Revit plugin
- the PCAD licensing server

It is the single source of truth for all implementation tasks given to coding agents.

## Scope

This redesign covers:
- user access roles
- per-command access
- signed access snapshots for offline/local enforcement
- plugin cache and refresh behavior
- server-side policy computation
- admin and automation APIs
- migration from the current localhost model

This redesign does not yet cover:
- public internet deployment hardening beyond the required API and token model
- company SSO integration
- dynamic ribbon layout from server-side manifests

## Current State

Today:
- Dokaflex calls the local server at `http://localhost:3000/api`
- the server returns only `allowed` and `accessLevel`
- the plugin decides command access locally with hardcoded `AccessLevel`
- commands are not server-authoritative
- the server `Command` table is metadata only
- cached authorization is local, but not a signed policy snapshot

This is insufficient for:
- granting one user one specific work-in-progress command
- changing access without C# edits
- secure offline access with controlled grace
- long-term compatibility between plugin and server

## Design Goals

1. Server is the source of truth for effective command access.
2. Plugin enforces access locally without server calls per command.
3. Access changes should not require C# edits once a command has a stable key.
4. Access must support:
   - released commands for normal users
   - testing commands for testers
   - development commands for boss
   - custom per-user grants and denies
5. Plugin must work when the server is unavailable for a limited grace window.
6. Cached local policy must be tamper-resistant.
7. The model must be testable on both sides.

## Core Terms

### Base Roles

- `USER`
- `TESTER`
- `BOSS`

### Command Stages

- `RELEASED`
- `TESTING`
- `DEVELOPMENT`
- `DISABLED`

### User Override Effects

- `GRANT`
- `DENY`

## Access Semantics

Base role grants:
- `USER` gets all commands with stage `RELEASED`
- `TESTER` gets all commands with stage `RELEASED` and `TESTING`
- `BOSS` gets all commands with stage `RELEASED`, `TESTING`, and `DEVELOPMENT`

Override rules:
1. Inactive user denies all access.
2. Start from the base role result.
3. Apply explicit `DENY` overrides.
4. Apply explicit `GRANT` overrides.
5. Any command with stage `DISABLED` is denied to everyone.

Notes:
- There is no separate persisted `CUSTOM` role.
- A user is "custom" only as a UI label when overrides exist.
- `DENY` beats base-role grants.
- `DISABLED` beats all grants.

## Command Identity

Each command must have a stable human-readable key.

Examples:
- `DF.GENERATE_BEAM`
- `DF.ARRAY_PRIMARY`
- `DF.UPDATE_PLUGIN`
- `DF.SMART_ARRAY`

Rules:
- The command key is the primary identifier used by the plugin.
- The server may also store:
  - `commandId` as UUID
  - `commandHash` as derived helper value
- The plugin must not depend on a hash as the only identifier.

Reason:
- keys remain readable in logs, UI, tests, and agent prompts
- permission changes do not require C# edits
- hashes are optional implementation details

## Signed Access Snapshot

The server issues a signed access snapshot to the plugin.

The plugin:
- verifies the signature
- stores the snapshot encrypted locally
- uses it for ribbon visibility and command execution

The plugin does not ask the server on every command.

### Snapshot Format

Use a custom signed envelope, not a JWT, to keep .NET Framework 4.8 verification simple.

Envelope:

```json
{
  "format": "pcad-access-snapshot/v1",
  "payload": {
    "snapshotId": "uuid",
    "policyVersion": 42,
    "pluginSlug": "dokaflex",
    "username": "ppetkov",
    "machineFingerprint": "base64url-or-hex",
    "machineName": "DEV-PC-01",
    "revitVersion": "2024",
    "baseRole": "TESTER",
    "allowedCommandKeys": [
      "DF.GENERATE_BEAM",
      "DF.SMART_ARRAY"
    ],
    "issuedAtUtc": "2026-03-08T10:00:00Z",
    "refreshAfterUtc": "2026-03-09T10:00:00Z",
    "graceUntilUtc": "2026-03-16T10:00:00Z"
  },
  "signature": "base64url-signature"
}
```

### Signature Model

- Server signs the payload with an asymmetric private key.
- Plugin verifies it with the matching embedded public key.

Why:
- a user cannot change allowed commands locally
- plugin does not need the signing private key
- this is stronger than a shared symmetric secret for local verification

### Local Storage

The plugin stores the snapshot in:
- `%AppData%\\Dokaflex\\Security\\access.snapshot`

Storage rules:
- encrypt at rest with Windows DPAPI
- bind to current user and current machine
- reject snapshots whose payload does not match the current user or machine fingerprint

## Plugin Refresh Behavior

### Refresh Triggers

The plugin refreshes the access snapshot:
- at startup if no valid current snapshot exists
- at startup if `refreshAfterUtc` has passed
- after a successful plugin update
- when the user explicitly refreshes access

### Offline Grace

Rules:
- normal refresh interval: 24 hours
- offline grace: 7 days from the last successful refresh

Behavior:
- if the server is down and the cached snapshot is still inside grace, keep the last known permissions
- if the cached snapshot is past grace, mute the plugin

Muted plugin behavior:
- do not create normal ribbon UI
- optionally allow one small diagnostic or refresh command if implemented later

### Command and Ribbon Enforcement

The plugin must enforce access in two places:
- ribbon/button visibility
- command execution

Rules:
- do not add a ribbon button if its `commandKey` is not allowed
- do not execute a command if its `commandKey` is not allowed
- command execution must be checked even if the button is hidden, because commands can still be invoked other ways

## Plugin Command Registration Pattern

Every command that should participate in server-driven access control must have:
- a stable `commandKey`
- a registration point in ribbon code

Recommended C# pattern:
- use a command attribute or explicit constant
- pass the key into ribbon registration

Example concept:

```text
[LicensedCommand("DF.GENERATE_BEAM")]
public class GenerateBeamCommand : LicensedExternalCommand
```

Ribbon registration concept:

```text
AddLicensedButton("DF.GENERATE_BEAM", typeof(GenerateBeamCommand), ...)
```

Important limitation:
- new access rules do not require C# edits
- a brand new ribbon button still requires plugin code unless dynamic ribbon manifests are introduced later

## Server API Contract

### Plugin API

New endpoint:
- `POST /api/plugin/access/refresh`

Request body:

```json
{
  "pluginSlug": "dokaflex",
  "username": "ppetkov",
  "machineName": "DEV-PC-01",
  "machineFingerprint": "base64url-or-hex",
  "revitVersion": "2024",
  "pluginVersion": "24.10.03"
}
```

Headers:
- `X-Plugin-Signature`: HMAC signature of the raw body

Response:
- signed access snapshot envelope

Notes:
- keep request authentication with the existing plugin HMAC secret in the first implementation phase
- move to HTTPS for remote deployment

### Plugin Usage Logging

Keep a usage endpoint, but extend it later to accept:
- `commandKey`
- `snapshotId`
- optional local timestamp

Current route can remain during migration:
- `POST /api/usage/log`

Future preferred route:
- `POST /api/plugin/usage/log`

### Admin API

Admin UI/session routes manage:
- users
- commands
- overrides
- snapshot preview
- security events

### Automation API

Automation endpoints are for trusted agents, not humans.

Initial required endpoint:
- `POST /api/automation/commands/register`

Request:
- `pluginSlug`
- `commandKey`
- `displayName`
- `stage`
- `category`
- `description`

Response:
- created command record

Authentication:
- scoped API key
- not the same mechanism as the plugin HMAC secret

## Server Data Model

Target tables:
- `User`
- `Command`
- `UserCommandOverride`
- `PluginSessionSnapshot`
- `UsageLog`
- `SecurityEvent`
- `ApiKey`

### User

Key fields:
- `id`
- `username`
- `isActive`
- `baseRole`
- `createdAt`
- `lastLoginAt`
- `lastMachineName`
- `lastMachineFingerprint`
- `lastRevitVersion`

### Command

Key fields:
- `id`
- `pluginSlug`
- `commandKey`
- `displayName`
- `stage`
- `isActive`
- `category`
- `description`
- `createdAt`
- `updatedAt`

### UserCommandOverride

Key fields:
- `id`
- `userId`
- `commandId`
- `effect`
- `expiresAt`
- `reason`
- `createdAt`

### PluginSessionSnapshot

Key fields:
- `snapshotId`
- `userId`
- `pluginSlug`
- `machineFingerprint`
- `machineName`
- `revitVersion`
- `policyVersion`
- `issuedAtUtc`
- `refreshAfterUtc`
- `graceUntilUtc`
- `revokedAtUtc`

This table is for audit and support. The plugin still trusts the signed snapshot it already has.

### UsageLog

Key fields:
- `id`
- `userId`
- `pluginSlug`
- `commandKey`
- `snapshotId`
- `timestamp`

### SecurityEvent

Examples:
- invalid signature
- disabled user attempt
- unknown user attempt
- expired snapshot usage attempt
- automation key misuse

### ApiKey

Key fields:
- `id`
- `name`
- `keyPrefix`
- `secretHash`
- `scopes`
- `isActive`
- `expiresAt`
- `lastUsedAt`

## UI Redesign

The server dashboard should become policy-first.

Recommended sections:
- Overview
- Users
- Commands
- Overrides
- Effective Access Preview
- Sessions
- Security Events
- API Keys
- Settings

Users screen:
- base role
- active state
- override count
- last machine
- last sync

Commands screen:
- command key
- display name
- stage
- active state
- category

Overrides screen:
- search by user
- search by command
- grant or deny
- optional expiry

Effective access preview:
- choose a user
- show the full resolved command set

## Security Requirements

1. Keep plugin request HMAC for phase 1 compatibility.
2. Use asymmetric signing for access snapshots.
3. Store admin automation keys hashed, never plaintext.
4. Remove insecure fallback admin credentials in the server implementation.
5. Use HTTPS when moving from localhost to remote server.
6. Log failed auth attempts and invalid signatures.
7. Do not trust local plugin files unless signature and DPAPI checks pass.

## Migration Strategy

### Phase 1

Goal:
- implement everything locally with the server still running on this machine
- preserve existing plugin functionality while the new system is introduced

Rules:
- keep current localhost base URL
- add the snapshot-based endpoints in parallel

### Phase 2

Switch Dokaflex from:
- simple access-level auth

To:
- snapshot-based access control

### Phase 3

Once stable locally:
- verify CI/CD
- move plugin API base URL from localhost to the real host
- deploy the server through GitHub Actions if the pipeline is ready

## Testing Requirements

### Server Tests

Must cover:
- base role stage grants
- override precedence
- disabled user behavior
- disabled command behavior
- signed snapshot generation
- invalid signature rejection
- plugin refresh contract shape
- automation API key auth
- offline grace timestamp generation

### Plugin Tests

Must cover:
- snapshot signature verification
- DPAPI cache abstraction behavior
- expired snapshot behavior
- grace-window behavior
- ribbon visibility from allowed command keys
- command execution deny/allow from allowed command keys
- refresh after update

### Contract Tests

Shared fixtures must verify:
- command keys
- snapshot payload fields
- timestamps
- precedence semantics

## Acceptance Criteria

This redesign is complete when:
- the server computes effective command access
- the plugin uses only the signed cached snapshot for runtime access decisions
- one user can receive one specific work-in-progress command without code changes
- normal users get only released commands
- testers get released plus testing commands
- boss gets all development commands
- offline grace works for 7 days after a valid refresh
- tests exist on both sides
- localhost works before any remote deployment is attempted
