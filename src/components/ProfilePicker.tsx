'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { getCurrentUser, setCurrentUser } from '@/utils/session';
import LoadingSpinner from './LoadingSpinner';

export default function ProfilePicker() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getCurrentUser()) {
      router.replace('/dashboard');
      return;
    }
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }

  function selectUser(user: Pick<User, 'id' | 'name'>) {
    setCurrentUser(user);
    router.push('/dashboard');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create profile');
      selectUser(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <LoadingSpinner label="Loading profiles…" />;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">PreACT TestPrep</h1>
      <p className="mb-8 text-gray-600">Who&apos;s practicing today?</p>

      {users.length > 0 && (
        <div className="mb-8 space-y-2">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => selectUser(user)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left font-medium text-gray-900 hover:border-blue-400 hover:bg-blue-50"
            >
              {user.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor="newName">
          {users.length > 0 ? 'Or add a new profile' : 'Create your profile'}
        </label>
        <div className="flex gap-2">
          <input
            id="newName"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Your name"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Start'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
