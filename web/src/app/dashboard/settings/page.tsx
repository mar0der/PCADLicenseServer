export default function SettingsPage() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">System Settings</h1>

            <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-sm max-w-2xl">
                <h2 className="text-xl font-semibold text-white mb-4">Configuration Details</h2>

                <div className="space-y-4 text-sm text-neutral-300">
                    <p>
                        Right now, your dashboard settings are managed securely via environment variables (in the <code>.env</code> file) rather than a database table. This prevents authorized Revit users from accidentally gaining access and changing system parameters.
                    </p>

                    <div className="pt-4 border-t border-neutral-700">
                        <h3 className="font-medium text-white mb-2">Active Environment Config:</h3>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Admin Credentials:</strong> Configured in <code>.env</code></li>
                            <li><strong>Authentication Secret:</strong> Configured in <code>.env</code></li>
                            <li><strong>Database:</strong> SQLite local file (<code>dev.db</code>)</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
