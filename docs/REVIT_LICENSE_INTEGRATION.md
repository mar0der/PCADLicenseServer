# Revit Plugin Integration

This guide describes the current Dokaflex integration contract for the PCAD licensing server.

## Production API Base

Use:

- `https://pcad.petarpetkov.com/api`

Active plugin endpoints:

- `POST /plugin/access/refresh`
- `POST /plugin/catalog/sync`
- `POST /plugin/config/refresh`
- `POST /plugin/usage/batch`

## Request Signing

Every plugin request is HMAC-signed with the shared `PLUGIN_SECRET`.

Required header:

- `X-Plugin-Signature: <hex-hmac-sha256>`

Signature rules:

- algorithm: `HMAC-SHA256`
- key: `PLUGIN_SECRET`
- message: exact raw JSON request body
- encoding: UTF-8
- output: lowercase hex

If the JSON changes after signing, signature verification fails with `401`.

## Access Refresh

Endpoint:

- `POST /api/plugin/access/refresh`

Request body:

```json
{
  "pluginSlug": "dokaflex",
  "username": "jdoe",
  "machineName": "WORKSTATION-01",
  "machineFingerprint": "stable-machine-fingerprint",
  "revitVersion": "2024",
  "pluginVersion": "26.13.49"
}
```

Success response:

```json
{
  "format": "pcad-access-snapshot/v1",
  "payload": {
    "snapshotId": "uuid",
    "policyVersion": 1,
    "pluginSlug": "dokaflex",
    "username": "jdoe",
    "machineFingerprint": "stable-machine-fingerprint",
    "machineName": "WORKSTATION-01",
    "revitVersion": "2024",
    "baseRole": "USER",
    "allowedCommandKeys": ["DF.UPDATE_PLUGIN"],
    "issuedAtUtc": "2026-03-25T18:41:41Z",
    "refreshAfterUtc": "2026-03-26T18:41:41Z",
    "graceUntilUtc": "2026-04-01T18:41:41Z"
  },
  "signature": "base64url-rsa-signature"
}
```

The client must verify the returned RSA signature with the public key before trusting the snapshot payload.

## Plugin Config Refresh

Endpoint:

- `POST /api/plugin/config/refresh`

Request body uses the same identity fields as access refresh:

```json
{
  "pluginSlug": "dokaflex",
  "username": "jdoe",
  "machineName": "WORKSTATION-01",
  "machineFingerprint": "stable-machine-fingerprint",
  "revitVersion": "2024",
  "pluginVersion": "26.13.49"
}
```

The response is a signed plugin configuration snapshot that contains:

- effective access state
- command metadata
- icon assets
- server-authored ribbon layout
- config version counters

Dokaflex should prefer this endpoint when building the ribbon because it contains both access and UI data.

## Plugin Catalog Sync

Endpoint:

- `POST /api/plugin/catalog/sync`

Purpose:

- upsert command identities
- upsert icon assets
- bump server capability catalog version when something changes

Important nuance:

- plugin-provided ribbon items are ignored
- ribbon layout is authored on the server

This means a new Dokaflex command usually appears on the server automatically after the plugin syncs its local command catalog.

## Usage Batch

Endpoint:

- `POST /api/plugin/usage/batch`

Request body:

```json
{
  "pluginSlug": "dokaflex",
  "events": [
    {
      "eventId": "uuid",
      "commandKey": "DF.GENERATE_BEAM",
      "username": "jdoe",
      "machineFingerprint": "stable-machine-fingerprint",
      "pluginVersion": "26.13.49",
      "revitVersion": "2024",
      "occurredAtUtc": "2026-03-25T18:41:41Z",
      "snapshotId": "uuid"
    }
  ]
}
```

The response acknowledges accepted and duplicate event IDs so the client can trim its local queue safely.

## New Command Workflow

For a new Dokaflex command:

1. Add the command in the Revit plugin with a stable `commandKey`.
2. Let the plugin publish it through `POST /api/plugin/catalog/sync`.
3. Adjust stage, metadata, user overrides, and ribbon placement in the admin UI or admin APIs.
4. Refresh the signed config snapshot so clients receive the updated access and ribbon state.

The admin web app and the admin APIs operate on the same server data. The main admin command endpoint is `POST /api/admin/commands`, but it requires an authenticated admin session.

## Reference Files

Current examples in this repo:

- `csharp_client_boilerplate.cs`
- `simulate_client.js`
- `web/public/simulate.js`
