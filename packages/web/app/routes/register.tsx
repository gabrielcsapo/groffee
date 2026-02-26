import { isFirstUser } from "../lib/server/auth";
import RegisterClient from "./register.client";

export default async function Register() {
  const isSetup = await isFirstUser();
  return <RegisterClient isSetup={isSetup} />;
}
