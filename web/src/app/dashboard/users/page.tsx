import prisma from "@/lib/prisma";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    });

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Licensed Users</h1>
            <UsersClient initialUsers={users} />
        </div>
    );
}
