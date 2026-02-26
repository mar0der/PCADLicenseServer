import prisma from "@/lib/prisma";
import CommandsClient from "./CommandsClient";

export const dynamic = 'force-dynamic';

export default async function CommandsPage() {
    const commands = await prisma.command.findMany({
        orderBy: { descriptiveName: "asc" },
    });

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Registered Commands</h1>
            <CommandsClient initialCommands={commands} />
        </div>
    );
}
