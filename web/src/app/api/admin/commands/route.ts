import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { uniqueName, descriptiveName, requiredAccessLevel } = await req.json();
        if (!uniqueName || !descriptiveName) {
            return new NextResponse("Unique Name and Descriptive Name required", { status: 400 });
        }

        const command = await prisma.command.create({
            data: {
                uniqueName: uniqueName.trim(),
                descriptiveName: descriptiveName.trim(),
                requiredAccessLevel: requiredAccessLevel ?? 1
            }
        });

        return NextResponse.json(command, { status: 201 });
    } catch (error) {
        console.error("Error creating command:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { id, descriptiveName, requiredAccessLevel } = await req.json();
        if (!id) return new NextResponse("Bad Request", { status: 400 });

        const dataToUpdate: any = {};
        if (descriptiveName) dataToUpdate.descriptiveName = descriptiveName.trim();
        if (requiredAccessLevel !== undefined) dataToUpdate.requiredAccessLevel = requiredAccessLevel;

        const command = await prisma.command.update({
            where: { id },
            data: dataToUpdate
        });

        return NextResponse.json(command, { status: 200 });
    } catch (error) {
        return new NextResponse("Internal server error", { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return new NextResponse("Bad Request", { status: 400 });

        await prisma.command.delete({
            where: { id }
        });

        return new NextResponse("Deleted", { status: 200 });
    } catch (error) {
        return new NextResponse("Internal server error", { status: 500 });
    }
}
