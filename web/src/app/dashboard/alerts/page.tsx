import prisma from "@/lib/prisma";

export default async function AlertsPage() {
    const failedAttempts = await prisma.failedAttempt.findMany({
        orderBy: { timestamp: "desc" },
    });

    const totalAlerts = failedAttempts.length;

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Security Alerts</h1>
                
                <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-2 flex items-center space-x-3">
                    <span className="text-red-400 text-sm font-medium">Total Unauthorized Attempts:</span>
                    <span className="text-red-400 font-bold text-xl">{totalAlerts}</span>
                </div>
            </div>

            <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                        <tr>
                            <th className="px-6 py-4 font-medium">Time</th>
                            <th className="px-6 py-4 font-medium">Attempted Username</th>
                            <th className="px-6 py-4 font-medium">Machine</th>
                            <th className="px-6 py-4 font-medium">Reason / Action Blocked</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-700">
                        {totalAlerts === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-neutral-500">
                                    No security alerts detected. Your environment is secure.
                                </td>
                            </tr>
                        ) : (
                            failedAttempts.map((log: { id: string; timestamp: Date; username: string | null; machineName: string | null; reason: string | null }) => (
                                <tr key={log.id} className="hover:bg-neutral-700/30 transition-colors">
                                    <td className="px-6 py-4 text-neutral-400 whitespace-nowrap">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-white">
                                        {log.username || "Unknown"}
                                    </td>
                                    <td className="px-6 py-4 text-neutral-300">
                                        {log.machineName || "-"}
                                    </td>
                                    <td className="px-6 py-4 text-red-400 font-medium">
                                        {log.reason}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
