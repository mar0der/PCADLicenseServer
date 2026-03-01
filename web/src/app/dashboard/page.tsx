import prisma from "@/lib/prisma";

export default async function DashboardOverview() {
    // Fetch overview statistics
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const totalUsage = await prisma.usageLog.count();
    const recentFailedAttempts = await prisma.failedAttempt.count({
        where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });

    // Top Commands
    const topCommandsRaw = await prisma.usageLog.groupBy({
        by: ['functionName'],
        _count: { functionName: true },
        orderBy: { _count: { functionName: 'desc' } },
        take: 10
    });

    // Resolve Command Descriptions
    const functionNames = topCommandsRaw.map(c => c.functionName);
    const commandDict = await prisma.command.findMany({
        where: { uniqueName: { in: functionNames } }
    });

    const topCommands = topCommandsRaw.map(cmd => {
        const found = commandDict.find(d => d.uniqueName === cmd.functionName);
        return {
            uniqueName: cmd.functionName,
            count: cmd._count.functionName,
            descriptiveName: found ? found.descriptiveName : cmd.functionName,
            requiredAccessLevel: found ? found.requiredAccessLevel : null
        };
    });

    // Top Users
    const topUsersRaw = await prisma.usageLog.groupBy({
        by: ['userId'],
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10
    });

    // Resolve User IDs to Usernames
    const userIds = topUsersRaw.map(u => u.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true }
    });

    const topUsers = topUsersRaw.map(u => ({
        username: users.find(user => user.id === u.userId)?.username || "Unknown User",
        count: u._count.userId
    }));

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">PCAD License System Overview</h1>

            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="p-6 bg-neutral-800 rounded-xl border border-neutral-700 shadow-sm flex flex-col justify-center">
                    <p className="text-sm font-medium text-neutral-400 mb-1">Total Users</p>
                    <div className="flex items-end justify-between">
                        <h2 className="text-4xl font-bold text-white">{totalUsers}</h2>
                    </div>
                </div>

                <div className="p-6 bg-neutral-800 rounded-xl border border-neutral-700 shadow-sm flex flex-col justify-center">
                    <p className="text-sm font-medium text-neutral-400 mb-1">Active Users</p>
                    <div className="flex items-end justify-between">
                        <h2 className="text-4xl font-bold text-green-400">{activeUsers}</h2>
                    </div>
                </div>

                <div className="p-6 bg-neutral-800 rounded-xl border border-neutral-700 shadow-sm flex flex-col justify-center">
                    <p className="text-sm font-medium text-neutral-400 mb-1">Total Tool Executions</p>
                    <div className="flex items-end justify-between">
                        <h2 className="text-4xl font-bold text-blue-400">{totalUsage}</h2>
                    </div>
                </div>

                <div className="p-6 bg-neutral-800 rounded-xl border border-neutral-700 shadow-sm flex flex-col justify-center">
                    <p className="text-sm font-medium text-neutral-400 mb-1">Failed Logins (24h)</p>
                    <div className="flex items-end justify-between">
                        <h2 className="text-4xl font-bold text-red-400">{recentFailedAttempts}</h2>
                    </div>
                </div>
            </div>

            {/* Dashboard Dashboards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Command Usage Leaderboard */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-white">Most Used Commands</h2>
                    <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Command</th>
                                    <th className="px-6 py-4 font-medium">Role</th>
                                    <th className="px-6 py-4 font-medium text-right">Executions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-700">
                                {topCommands.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-8 text-center text-neutral-500">
                                            No commands executed yet.
                                        </td>
                                    </tr>
                                ) : (
                                    topCommands.map((cmd) => (
                                        <tr key={cmd.uniqueName} className="hover:bg-neutral-700/30 transition-colors">
                                            <td className="px-6 py-4 overflow-hidden">
                                                <div className="font-medium text-blue-400 truncate" title={cmd.descriptiveName}>
                                                    {cmd.descriptiveName}
                                                </div>
                                                {cmd.descriptiveName !== cmd.uniqueName && (
                                                    <div className="text-xs text-neutral-500 font-mono mt-0.5 truncate" title={cmd.uniqueName}>
                                                        {cmd.uniqueName}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {cmd.requiredAccessLevel ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-700 text-neutral-300">
                                                        {cmd.requiredAccessLevel === 1 ? 'User' : cmd.requiredAccessLevel === 2 ? 'Tester' : 'Boss'}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-neutral-600">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-white">
                                                {cmd.count}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Users Usage Leaderboard */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-white">Top Active Users</h2>
                    <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Username</th>
                                    <th className="px-6 py-4 font-medium text-right">Total Executions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-700">
                                {topUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={2} className="px-6 py-8 text-center text-neutral-500">
                                            No usage data available.
                                        </td>
                                    </tr>
                                ) : (
                                    topUsers.map((user) => (
                                        <tr key={user.username} className="hover:bg-neutral-700/30 transition-colors">
                                            <td className="px-6 py-4 font-medium text-green-400">
                                                {user.username}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-white">
                                                {user.count}
                                            </td>
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
