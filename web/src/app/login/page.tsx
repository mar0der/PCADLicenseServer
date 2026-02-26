"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const res = await signIn("credentials", {
            username,
            password,
            redirect: false,
        });

        if (res?.error) {
            setError("Invalid credentials.");
        } else {
            router.push("/dashboard");
        }
    };

    return (
        <div className="flex items-center justify-center min-vh-100 min-h-screen bg-neutral-900 text-white">
            <div className="w-full max-w-sm p-8 space-y-6 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700">
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Revit Licensing</h1>
                    <p className="text-sm text-neutral-400">Sign in to manage plugins</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-neutral-300">Username</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="flex h-10 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1" placeholder="admin" />
                    </div>
                    <div>
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-neutral-300">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="flex h-10 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1" />
                    </div>

                    {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

                    <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 w-full">Sign In</button>
                </form>
            </div>
        </div>
    );
}
