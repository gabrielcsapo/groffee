"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getSessionUser } from "../lib/server/auth";
import { getAdminUsers, toggleUserAdmin } from "../lib/server/admin";
import { AdminNav } from "./admin";

interface UserEntry {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: Date;
}

export default function AdminUsers() {
  const [userList, setUserList] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    getSessionUser()
      .then((user) => {
        if (!user?.isAdmin) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
        setCurrentUserId(user.id);
        return getAdminUsers();
      })
      .then((users) => {
        if (users) setUserList(users as unknown as UserEntry[]);
      })
      .catch(() => setAuthorized(false))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleAdmin(userId: string, isAdmin: boolean) {
    setToggling(userId);
    try {
      await toggleUserAdmin(userId, isAdmin);
      setUserList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isAdmin } : u)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setToggling(null);
    }
  }

  if (!authorized) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-text-secondary">Admin access required.</p>
        <Link to="/" className="text-primary mt-4 inline-block">Go home</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">User Management</h1>
      <p className="text-text-secondary text-sm mb-6">Manage user accounts and permissions</p>
      <AdminNav />

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-secondary text-text-secondary">
              <th className="text-left px-4 py-2.5 font-medium">Username</th>
              <th className="text-left px-4 py-2.5 font-medium">Email</th>
              <th className="text-left px-4 py-2.5 font-medium w-24">Role</th>
              <th className="text-left px-4 py-2.5 font-medium w-32">Joined</th>
              <th className="text-left px-4 py-2.5 font-medium w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">Loading...</td>
              </tr>
            ) : userList.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">No users found</td>
              </tr>
            ) : (
              userList.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-surface-secondary/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/${user.username}`} className="font-medium text-primary hover:underline">
                      {user.username}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{user.email}</td>
                  <td className="px-4 py-2.5">
                    {user.isAdmin ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary">
                        Admin
                      </span>
                    ) : (
                      <span className="text-text-secondary text-xs">User</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {user.id === currentUserId ? (
                      <span className="text-text-secondary text-xs">You</span>
                    ) : (
                      <button
                        onClick={() => handleToggleAdmin(user.id, !user.isAdmin)}
                        disabled={toggling === user.id}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                          user.isAdmin
                            ? "border border-danger/30 text-danger hover:bg-danger/10"
                            : "border border-border text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
                        } disabled:opacity-50`}
                      >
                        {toggling === user.id
                          ? "..."
                          : user.isAdmin
                            ? "Remove admin"
                            : "Make admin"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
