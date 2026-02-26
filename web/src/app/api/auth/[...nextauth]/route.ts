import NextAuth, { NextAuthOptions } from "next-auth";
importCredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
    providers: [
        importCredentialsProvider.default({
            name: "Admin Credentials",
            credentials: {
                username: { label: "Username", type: "text", placeholder: "admin" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                // Read from ENV, default to admin/admin123 for local testing
                const adminUser = process.env.ADMIN_USERNAME || "admin";
                const adminPass = process.env.ADMIN_PASSWORD || "admin123";

                if (credentials?.username === adminUser && credentials?.password === adminPass) {
                    return { id: "1", name: adminUser };
                }
                return null;
            }
        })
    ],
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
    },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
