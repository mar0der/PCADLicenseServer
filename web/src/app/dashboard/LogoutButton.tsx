"use client";
import { signOut } from "next-auth/react";

export default function LogoutButton() {
    return (
        <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-red-500 hover:text-red-400 transition-colors font-semibold"
        >
            Sign Out
        </button>
    );
}
