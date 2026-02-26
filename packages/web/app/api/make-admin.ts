/**
 * Promote a user to admin.
 *
 * Usage: pnpm make-admin <username>
 */
import { db, users } from "@groffee/db";
import { eq } from "drizzle-orm";

const username = process.argv[2];

if (!username) {
  console.error("Usage: pnpm make-admin <username>");
  process.exit(1);
}

const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

if (!user) {
  console.error(`User "${username}" not found.`);
  process.exit(1);
}

if (user.isAdmin) {
  console.log(`User "${username}" is already an admin.`);
  process.exit(0);
}

await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
console.log(`User "${username}" is now an admin.`);
