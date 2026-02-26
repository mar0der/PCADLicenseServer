import crypto from 'crypto';

/**
 * Validates the HMAC-SHA256 signature of the incoming request payload.
 * The shared secret must be defined in process.env.PLUGIN_SECRET.
 */
export function verifySignature(payload: string, signature: string | null): boolean {
    if (!signature) return false;

    const secret = process.env.PLUGIN_SECRET;
    if (!secret) {
        console.warn("WARNING: PLUGIN_SECRET is not set in environment variables.");
        // In production, we should probably fail securely here.
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch (e) {
        // If the signature is not proper hex length, timingSafeEqual throws
        return false;
    }
}
