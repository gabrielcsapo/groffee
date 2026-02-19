"use client";

import { useState } from "react";
import { Link } from "react-router";
import { GroffeeLogo } from "../components/groffee-logo";
import { login } from "../lib/server/auth";

export default function Login() {
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = new FormData(e.currentTarget);
    const result = await login(
      form.get("username") as string,
      form.get("password") as string,
    );

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.setCookie) document.cookie = result.setCookie;
    window.location.href = "/";
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="text-center mb-6">
        <GroffeeLogo size={48} className="mx-auto text-text-primary mb-4" />
        <h1 className="text-2xl font-semibold">Sign in to Groffee</h1>
      </div>
      <div className="bg-surface border border-border rounded-lg p-6 shadow-sm">
        {error && (
          <div className="mb-4 p-3 rounded-md bg-danger-bg border border-danger/30 text-danger text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>
      </div>
      <div className="bg-surface border border-border rounded-lg p-4 mt-4 text-center text-sm">
        New to Groffee? <Link to="/register">Create an account</Link>.
      </div>
    </div>
  );
}
