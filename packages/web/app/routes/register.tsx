"use client";

import { useState } from "react";
import { Link } from "react-router";
import { GroffeeLogo } from "../components/groffee-logo";
import { register } from "../lib/server/auth";

export default function Register() {
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    const result = await register(
      form.get("username") as string,
      form.get("email") as string,
      password,
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
        <h1 className="text-2xl font-semibold">Create your account</h1>
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
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
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
              minLength={8}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <p className="text-xs text-text-secondary mt-1">Must be at least 8 characters</p>
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium mb-1">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Create account
          </button>
        </form>
      </div>
      <div className="bg-surface border border-border rounded-lg p-4 mt-4 text-center text-sm">
        Already have an account? <Link to="/login">Sign in</Link>.
      </div>
    </div>
  );
}
