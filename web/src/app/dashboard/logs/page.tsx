import prisma from "@/lib/prisma";

export default async function LogsPage() {
    const [usageLogs, failedAttempts] = await Promise.all([
        prisma.usageLog.findMany({
            orderBy: { timestamp: "desc" },
            take: 50,
            include: { user: { select: { username: true } } },
        }),
        prisma.failedAttempt.findMany({
            orderBy: { timestamp: "desc" },
            take: 50,
        }),
    ]);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">System Logs</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Failed Login Attempts */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-red-400">Recent Failed Logins</h2>
                    <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                                <tr>
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3">Username</th>
                                    <th className="px-4 py-3">PC</th>
                                    <th className="px-4 py-3">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-700">
                                {failedAttempts.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">No failed attempts logged.</td>
                                    </tr>
                                ) : (
                                    failedAttempts.map((log) => (
                                        <tr key={log.id} className="hover:bg-neutral-700/30">
                                            <td className="px-4 py-3 text-neutral-400">{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className="px-4 py-3 font-medium text-white">{log.username || "Unknown"}</td>
                                            <td className="px-4 py-3 text-neutral-300">{log.machineName || "-"}</td>
                                            <td className="px-4 py-3 text-red-400">{log.reason}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Successful Tool Executions */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-blue-400">Recent Tool Usage</h2>
                    <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                                <tr>
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3">User</th>
                                    <th className="px-4 py-3">Function Name</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-700">
                                {usageLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">No usage logs yet.</td>
                                    </tr>
                                ) : (
                                    usageLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-neutral-700/30">
                                            <td className="px-4 py-3 text-neutral-400">{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className="px-4 py-3 font-medium text-white">{log.user?.username || "Unknown"}</td>
                                            <td className="px-4 py-3 text-neutral-300">{log.functionName}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
