import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        const signature = req.headers.get('X-Plugin-Signature');

        if (!verifySignature(rawBody, signature)) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const data = JSON.parse(rawBody);
        const { username, functionName } = data;

        if (!username || !functionName) {
            return new NextResponse('Bad Request', { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (user && user.isActive) {
            await prisma.usageLog.create({
                data: {
                    userId: user.id,
                    functionName,
                }
            });
            return new NextResponse('Logged', { status: 200 });
        }

        // Unauthorized tool execution
        await prisma.failedAttempt.create({
            data: {
                username,
                userId: user?.id || null, // Keep reference if they exist but are disabled
                reason: `Unauthorized Tool Execution: ${functionName}`,
            }
        });

        // Fire and forget for the client, but tell tests it was ignored
        return new NextResponse('Ignored', { status: 200 });

    } catch (error) {
        console.error('Usage Log API Error:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
