import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "admin" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: Record<"username" | "password", string> | undefined) {
        const adminUser = process.env.ADMIN_USERNAME?.trim();
        const adminPass = process.env.ADMIN_PASSWORD?.trim();

        if (!adminUser || !adminPass) {
          console.error("Missing ADMIN_USERNAME or ADMIN_PASSWORD configuration.");
          return null;
        }

        if (credentials?.username === adminUser && credentials?.password === adminPass) {
          return { id: "1", name: adminUser };
        }

        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
};
