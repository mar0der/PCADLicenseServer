import prisma from "@/lib/prisma";

export default async function DashboardOverview() {
    // Fetch overview statistics
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const totalUsage = await prisma.usageLog.count();
    const recentFailedAttempts = await prisma.failedAttempt.count({
        where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">System Overview</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        </div>
    );
}
