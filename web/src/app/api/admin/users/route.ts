import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { username, isActive } = await req.json();
        if (!username) return new NextResponse("Username required", { status: 400 });

        const user = await prisma.user.create({
            data: {
                username: username,
                isActive: isActive !== undefined ? isActive : true
            }
        });

        return NextResponse.json(user, { status: 201 });
    } catch (error) {
        console.error("Error creating user:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { id, isActive } = await req.json();
        if (!id || isActive === undefined) return new NextResponse("Bad Request", { status: 400 });

        const user = await prisma.user.update({
            where: { id },
            data: { isActive }
        });

        return NextResponse.json(user, { status: 200 });
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

        await prisma.user.delete({
            where: { id }
        });

        return new NextResponse("Deleted", { status: 200 });
    } catch (error) {
        return new NextResponse("Internal server error", { status: 500 });
    }
}
