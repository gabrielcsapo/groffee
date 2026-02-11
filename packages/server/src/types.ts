import type { InferSelectModel } from "drizzle-orm";
import type { users, sessions } from "@groffee/db";

export type User = InferSelectModel<typeof users>;
export type Session = InferSelectModel<typeof sessions>;

export type AppEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};
