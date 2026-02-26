const crypto = require('crypto');

const API_URL = 'http://localhost:3000/api';
const PLUGIN_SECRET = 'your-very-long-and-secure-random-string';

// Helper function to generate HMAC signature (matches C# logic)
function generateSignature(payload) {
    return crypto
        .createHmac('sha256', PLUGIN_SECRET)
        .update(payload)
        .digest('hex');
}

async function simulate() {
    console.log("--- 1. Testing Authentication ---");
    const authPayload = JSON.stringify({
        username: "ppetkov", // Or whichever username you added to the dashboard
        machineName: "DEV-PC-01",
        revitVersion: "2024"
    });

    const authSig = generateSignature(authPayload);
    console.log("Payload:", authPayload);
    console.log("Signature (X-Plugin-Signature):", authSig);

    try {
        const authRes = await fetch(`${API_URL}/auth/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Plugin-Signature": authSig
            },
            body: authPayload
        });

        const authData = await authRes.json();
        console.log("Status:", authRes.status);
        console.log("Response:", authData);

        if (authRes.status === 200) {
            console.log("\n✅ Plugin would now load Revit Ribbon UI!");
        } else {
            console.log("\n❌ Plugin would NOT load Ribbon UI.");
        }

    } catch (err) {
        console.error("Auth Request Failed:", err);
    }

    console.log("\n--- 2. Testing Usage Logging ---");
    const logPayload = JSON.stringify({
        username: "ppetkov",
        functionName: "ExportToExcel_Simulated"
    });

    const logSig = generateSignature(logPayload);
    console.log("Payload:", logPayload);

    try {
        const logRes = await fetch(`${API_URL}/usage/log`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Plugin-Signature": logSig
            },
            body: logPayload
        });

        console.log("Status:", logRes.status);
        const logText = await logRes.text();
        console.log("Response:", logText);

        if (logRes.status === 200) {
            if (logText === 'Logged') {
                console.log("✅ Tool usage recorded successfully! Check the dashboard.");
            } else {
                console.log("❌ Tool usage was IGNORED by server (User disabled or missing).");
            }
        }

    } catch (err) {
        console.error("Log Request Failed:", err);
    }
}

simulate();
