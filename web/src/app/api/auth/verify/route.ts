import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        // 1. Read Raw Body for Signature Verification
        const rawBody = await req.text();
        const signature = req.headers.get('X-Plugin-Signature');

        if (!verifySignature(rawBody, signature)) {
            return NextResponse.json(
                { allowed: false, message: 'Invalid signature' },
                { status: 401 }
            );
        }

        // 2. Parse Payload
        const data = JSON.parse(rawBody);
        const { username, machineName, revitVersion } = data;

        if (!username) {
            return NextResponse.json(
                { allowed: false, message: 'Username missing' },
                { status: 400 }
            );
        }

        // 3. Database Check
        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (!user || !user.isActive) {
            // Log Failed Attempt
            await prisma.failedAttempt.create({
                data: {
                    username,
                    machineName: machineName || null,
                    reason: !user ? 'User not found' : 'User is disabled',
                    userId: user?.id || null, // Optional relation if the user actually exists but is disabled
                }
            });

            return NextResponse.json(
                { allowed: false, message: 'Access denied' },
                { status: 403 }
            );
        }

        // 4. Update User Login Data
        await prisma.user.update({
            where: { id: user.id },
            data: {
                lastLogin: new Date(),
                machineName: machineName || user.machineName,
                lastRevitVersion: revitVersion || user.lastRevitVersion
            }
        });

        return NextResponse.json(
            { allowed: true, accessLevel: user.accessLevel, message: 'Access granted' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Verify API Error:', error);
        return NextResponse.json(
            { allowed: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
