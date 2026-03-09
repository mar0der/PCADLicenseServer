import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    return (
        <div className="flex h-screen bg-neutral-900 text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 flex flex-col justify-between border-r border-neutral-800 bg-neutral-950">
                <div className="p-6">
                    <div className="flex items-center space-x-2 mb-8">
                        <div className="h-8 w-8 bg-blue-600 rounded flex flex-col justify-center items-center font-bold">P</div>
                        <span className="text-xl font-bold tracking-wider">PCAD License</span>
                    </div>
                    <nav className="space-y-2">
                        <Link href="/dashboard" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Overview</span>
                        </Link>
                        <Link href="/dashboard/users" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Licensed Users</span>
                        </Link>
                        <Link href="/dashboard/logs" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Usage Logs</span>
                        </Link>
                        <Link href="/dashboard/dokaflex" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Dokaflex Control</span>
                        </Link>
                        <Link href="/dashboard/commands" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Catalog And Usage</span>
                        </Link>
                        <Link href="/dashboard/alerts" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Security Alerts</span>
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors">
                            <span className="text-sm font-medium">Settings</span>
                        </Link>
                    </nav>
                </div>
                <div className="p-4 border-t border-neutral-800">
                    <div className="flex justify-between items-center px-4 py-2">
                        <span className="text-sm text-neutral-400">Admin Logged In</span>
                        <LogoutButton />
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto w-full bg-neutral-900">
                {children}
            </main>
        </div>
    );
}
