# Revit License Integration

This guide explains how the Revit client should call the licensing server in production.

## 1) Production API Base

Use:

- `https://pcad.petarpetkov.com/api`

Endpoints:

- Verify access: `POST /auth/verify`
- Log usage: `POST /usage/log`

Full URLs:

- `https://pcad.petarpetkov.com/api/auth/verify`
- `https://pcad.petarpetkov.com/api/usage/log`

## 2) C# Stub Configuration

Current stub is still placeholder at:

- [csharp_client_boilerplate.cs](/Users/petarpetkov/Developer/PCADLicensingServer/csharp_client_boilerplate.cs:19)

Set constants to production values:

```csharp
private const string API_URL = "https://pcad.petarpetkov.com/api";
private const string PLUGIN_SECRET = "your-plugin-secret-from-server-env";
```

`PLUGIN_SECRET` must match server env:

- `/opt/pcad/site/.env.server` -> `PLUGIN_SECRET=...`

## 3) Request Signature Contract

Header required on both endpoints:

- `X-Plugin-Signature: <hex-hmac-sha256>`

Signature algorithm:

- HMAC-SHA256
- Key: `PLUGIN_SECRET`
- Message: exact raw JSON request body string
- Encoding: UTF-8
- Output: lowercase hex

If body text changes after signing (property order/spacing differences), signature verification fails with `401`.

## 4) Verify Access API

Endpoint:

- `POST /api/auth/verify`

Body:

```json
{
  "username": "jdoe",
  "machineName": "WORKSTATION-01",
  "revitVersion": "2024"
}
```

Typical responses:

- `200` -> `{"allowed": true, "accessLevel": <int>, "message": "Access granted"}`
- `401` -> invalid signature
- `403` -> user not found or disabled
- `400` -> missing username

## 5) Usage Log API

Endpoint:

- `POST /api/usage/log`

Body:

```json
{
  "username": "jdoe",
  "functionName": "ExportToExcel"
}
```

Typical responses:

- `200` + `Logged` when usage is stored
- `200` + `Ignored` when user is missing/disabled
- `401` invalid signature
- `400` bad payload

## 6) Admin Side Requirements

For clients to be granted license:

1. Admin logs in at `https://pcad.petarpetkov.com/login`.
2. Creates/maintains `User` record with matching `username`.
3. Ensures `isActive = true`.

## 7) Local Simulation Scripts

These are currently local-only defaults and should be adjusted for production testing:

- [simulate_client.js](/Users/petarpetkov/Developer/PCADLicensingServer/simulate_client.js:3)
- [simulate.js](/Users/petarpetkov/Developer/PCADLicensingServer/web/public/simulate.js:3)

Change `API_URL` to:

- `https://pcad.petarpetkov.com/api`

