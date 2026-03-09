# Local Live Testing

Use a runtime copy outside OneDrive for stable local Dokaflex testing. The current recommended pattern is:

1. Keep this workspace as the source checkout inside OneDrive.
2. Sync a runtime copy to a normal local path such as `C:\dev\PCADLicenseServer-local`.
3. Keep runtime-only files in that copy:
   - `web/.env.local`
   - `web/keys/access-snapshot.private.pem`
   - any other local secrets or machine-specific config
4. Run the Next.js server from the runtime copy, not from the OneDrive checkout.

## Helper Script

Use `scripts/sync_local_runtime.ps1` from this repo root.

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_local_runtime.ps1 -InstallDependencies
```

With an explicit runtime path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_local_runtime.ps1 -RuntimeRoot C:\dev\PCADLicenseServer-local -InstallDependencies -StartDevServer
```

The script:

- syncs the repo to a non-OneDrive runtime directory
- skips transient folders such as `node_modules`, `.next`, and `.test-runtime`
- keeps private key material and `.env.local` out of the copied repo by default
- optionally runs `npm install` and `npm run dev` inside `web`

## Recommended Local Workflow

1. Sync the runtime copy.
2. Place the local signing key and env file in the runtime copy only.
3. Start the server from `C:\dev\PCADLicenseServer-local\web`.
4. Open the dashboard and use:
   - `Dokaflex Control` for bootstrap, layout editing, and local test status
   - `Licensed Users` -> `Customize Dokaflex` for per-user access control
5. Let the plugin call `/api/plugin/config/refresh` against the runtime server.

## Notes

- Do not commit runtime-only secrets back into the repo.
- If Prisma client regeneration fails because a dev server is still running, stop the runtime server first and rerun the command from the runtime copy.
- If you want a different runtime path by default, set `PCAD_LOCAL_RUNTIME_ROOT` in your local shell profile before running the helper script.
