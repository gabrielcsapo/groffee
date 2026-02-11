"use client";

import { useState } from "react";
import { useNavigate } from "react-router";

export default function NewRepo() {
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        isPublic: form.get("visibility") === "public",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create repository");
      return;
    }

    navigate(`/${data.repository.owner}/${data.repository.name}`);
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Create a new repository</h1>
      <p className="text-text-secondary mb-6">
        A repository contains all project files, including the revision history.
      </p>

      <div className="border-t border-border pt-6">
        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 border border-danger/30 text-danger text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Repository name <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              pattern="[a-zA-Z0-9._-]+"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="my-awesome-project"
            />
            <p className="text-xs text-text-secondary mt-1">
              Use letters, numbers, hyphens, dots, and underscores.
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Description <span className="text-text-secondary">(optional)</span>
            </label>
            <input
              id="description"
              name="description"
              type="text"
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <fieldset className="border-t border-border pt-4">
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  defaultChecked
                  className="mt-1"
                />
                <div>
                  <span className="font-medium text-sm">Public</span>
                  <p className="text-xs text-text-secondary">Anyone can see this repository.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="visibility" value="private" className="mt-1" />
                <div>
                  <span className="font-medium text-sm">Private</span>
                  <p className="text-xs text-text-secondary">
                    You choose who can see and commit to this repository.
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          <div className="border-t border-border pt-4">
            <button
              type="submit"
              className="bg-success text-white px-4 py-2 rounded-md font-medium text-sm hover:opacity-90"
            >
              Create repository
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
