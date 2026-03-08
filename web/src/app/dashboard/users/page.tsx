import prisma from "@/lib/prisma";
import { DEFAULT_PLUGIN_SLUG } from "@/lib/access-control/compat";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    });
    const dokaflexCommands = await prisma.command.findMany({
        where: { pluginSlug: DEFAULT_PLUGIN_SLUG },
        orderBy: { commandKey: "asc" },
    });

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Licensed Users</h1>
            <UsersClient initialUsers={users} initialDokaflexCommands={dokaflexCommands} />
        </div>
    );
}
