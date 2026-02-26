import prisma from "@/lib/prisma";

export default async function LogsPage() {
    const usageLogs = await prisma.usageLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 50,
        include: { user: { select: { username: true } } },
    });

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">System Logs</h1>

            <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left px-4">
                    <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                        <tr>
                            <th className="px-6 py-4 font-medium">Time</th>
                            <th className="px-6 py-4 font-medium">User</th>
                            <th className="px-6 py-4 font-medium">Executed Function</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usageLogs.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-neutral-500">
                                    No usage logs found.
                                </td>
                            </tr>
                        ) : (
                            usageLogs.map((log) => (
                                <tr key={log.id} className="border-b border-neutral-700 hover:bg-neutral-700/30 transition-colors">
                                    <td className="px-6 py-4 text-neutral-400">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-white">
                                        {log.user?.username || "Unknown"}
                                    </td>
                                    <td className="px-6 py-4 text-neutral-300">
                                        {log.functionName}
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
