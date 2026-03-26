const crypto = require("crypto");

const API_URL = "http://localhost:3000/api";
const PLUGIN_SECRET = "your-plugin-secret-from-server-env";
const PLUGIN_SLUG = "dokaflex";

function generateSignature(payload) {
    return crypto
        .createHmac("sha256", PLUGIN_SECRET)
        .update(payload)
        .digest("hex");
}

async function signedPost(path, payload) {
    const body = JSON.stringify(payload);
    const signature = generateSignature(body);

    return fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Plugin-Signature": signature
        },
        body
    });
}

async function simulate() {
    console.log("--- 1. Testing Access Snapshot Refresh ---");
    const identity = {
        pluginSlug: PLUGIN_SLUG,
        username: "ppetkov",
        machineName: "DEV-PC-01",
        machineFingerprint: "dev-pc-01",
        revitVersion: "2024",
        pluginVersion: "26.13.49"
    };
    console.log("Payload:", JSON.stringify(identity));

    try {
        const accessRes = await signedPost("/plugin/access/refresh", identity);
        const accessData = await accessRes.json();
        console.log("Status:", accessRes.status);
        console.log("Snapshot format:", accessData.format);
        console.log("Allowed commands:", accessData.payload?.allowedCommandKeys?.length ?? 0);
    } catch (err) {
        console.error("Access Refresh Failed:", err);
    }

    console.log("\n--- 2. Testing Plugin Config Refresh ---");
    try {
        const configRes = await signedPost("/plugin/config/refresh", identity);
        const configData = await configRes.json();
        console.log("Status:", configRes.status);
        console.log("Command count:", configData.payload?.commands?.length ?? 0);
        console.log("Ribbon tabs:", configData.payload?.ribbonTabs?.length ?? 0);
    } catch (err) {
        console.error("Config Refresh Failed:", err);
    }

    console.log("\n--- 3. Testing Usage Batch ---");
    const usagePayload = {
        pluginSlug: PLUGIN_SLUG,
        events: [
            {
                eventId: crypto.randomUUID(),
                commandKey: "DF.GENERATE_BEAM",
                username: "ppetkov",
                machineFingerprint: "dev-pc-01",
                pluginVersion: "26.13.49",
                revitVersion: "2024",
                occurredAtUtc: new Date().toISOString(),
                snapshotId: crypto.randomUUID()
            }
        ]
    };
    console.log("Payload:", JSON.stringify(usagePayload));

    try {
        const usageRes = await signedPost("/plugin/usage/batch", usagePayload);
        console.log("Status:", usageRes.status);
        console.log("Response:", await usageRes.json());
    } catch (err) {
        console.error("Usage Batch Failed:", err);
    }
}

simulate();
