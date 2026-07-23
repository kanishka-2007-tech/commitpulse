'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Target, Edit2, Check, X } from 'lucide-react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTranslation } from '@/context/TranslationContext';

interface GoalTrackerProps {
  username: string;
  activity: Array<{ count: number; date: string }>;
}

interface UserGoals {
  monthly: number;
  yearly: number;
}

const DEFAULT_GOALS: UserGoals = {
  monthly: 100,
  yearly: 1000,
};

const GOALS_API = '/api/user/goals';

export default function GoalTracker({ username, activity = [] }: GoalTrackerProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  // localStorage acts as an instant cache so the UI renders immediately.
  const [goals, setGoals] = useLocalStorage<UserGoals>(
    `commitpulse:goals:${username.toLowerCase()}`,
    DEFAULT_GOALS
  );

  // Track whether the server has returned a value yet (to show a loading hint
  // only when localStorage had no prior value for this user).
  const [serverSynced, setServerSynced] = useState(false);
  const saveControllerRef = useRef<AbortController | null>(null);

  // On mount, fetch goals from the server. The server value is authoritative
  // and overwrites localStorage so all devices stay in sync.
  useEffect(() => {
    let cancelled = false;

    async function fetchServerGoals() {
      try {
        const res = await fetch(
          `${GOALS_API}?username=${encodeURIComponent(username.toLowerCase())}`,
          { cache: 'no-store' }
        );
        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (
          data?.goals &&
          typeof data.goals.monthly === 'number' &&
          typeof data.goals.yearly === 'number'
        ) {
          setGoals(data.goals);
        }
      } catch {
        // Network failure — silently keep local value
      } finally {
        if (!cancelled) setServerSynced(true);
      }
    }

    fetchServerGoals();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const [editMonthly, setEditMonthly] = useState(goals.monthly.toString());
  const [editYearly, setEditYearly] = useState(goals.yearly.toString());

  // Compute current month and year based on local time
  const now = new Date();
  const yearStr = now.getFullYear().toString();
  const monthStr = `${yearStr}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

  // Calculate actual contributions from user's history
  const monthlyContributions = activity
    .filter((d) => d.date.startsWith(monthStr))
    .reduce((sum, d) => sum + d.count, 0);

  const yearlyContributions = activity
    .filter((d) => d.date.startsWith(yearStr))
    .reduce((sum, d) => sum + d.count, 0);

  // Compute percentages and goals
  const monthlyPercent = Math.min(100, Math.round((monthlyContributions / goals.monthly) * 100));
  const yearlyPercent = Math.min(100, Math.round((yearlyContributions / goals.yearly) * 100));

  const monthlyRemaining = Math.max(0, goals.monthly - monthlyContributions);
  const yearlyRemaining = Math.max(0, goals.yearly - yearlyContributions);

  const handleEdit = () => {
    setEditMonthly(goals.monthly.toString());
    setEditYearly(goals.yearly.toString());
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newMonthly = Math.max(1, parseInt(editMonthly, 10) || DEFAULT_GOALS.monthly);
    const newYearly = Math.max(1, parseInt(editYearly, 10) || DEFAULT_GOALS.yearly);
    const newGoals: UserGoals = { monthly: newMonthly, yearly: newYearly };

    // Optimistic local update — instant feedback regardless of network
    setGoals(newGoals);
    setIsEditing(false);

    // Abort any in-flight previous save
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    saveControllerRef.current = controller;

    // Persist to server in the background
    fetch(GOALS_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.toLowerCase(),
        monthly: newMonthly,
        yearly: newYearly,
      }),
      signal: controller.signal,
    }).catch((err) => {
      // AbortError is expected when navigating away — swallow silently
      if (err?.name !== 'AbortError') {
        console.warn('[GoalTracker] Failed to persist goals to server:', err);
      }
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  // Show a subtle loading state only when: (a) no localStorage value existed
  // AND (b) the server hasn't responded yet. This avoids any flash for returning users.
  const isInitialLoad =
    !serverSynced &&
    goals.monthly === DEFAULT_GOALS.monthly &&
    goals.yearly === DEFAULT_GOALS.yearly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: 0.12 }}
      className="p-6 rounded-xl bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-[rgba(255,255,255,0.08)] shadow-sm"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Target size={16} className="text-zinc-500 dark:text-[#A1A1AA]" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
            {t('dashboard.goals.title') || 'Contribution Goals'}
          </h3>
        </div>
        {!isEditing && (
          <button
            onClick={handleEdit}
            aria-label={t('dashboard.goals.edit') || 'Edit Goals'}
            className="p-1.5 rounded-lg border border-black/5 dark:border-[rgba(255,255,255,0.04)] hover:bg-gray-100 dark:hover:bg-zinc-900 text-zinc-500 dark:text-[#A1A1AA] hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <Edit2 size={13} />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.form
            key="edit-form"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            onSubmit={handleSave}
            className="space-y-4"
          >
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="monthly-goal-input"
                  className="block text-xs font-medium text-zinc-500 dark:text-[#A1A1AA] mb-1.5"
                >
                  {t('dashboard.goals.monthly') || 'Monthly Target'}
                </label>
                <input
                  id="monthly-goal-input"
                  type="number"
                  min="1"
                  value={editMonthly}
                  onChange={(e) => setEditMonthly(e.target.value)}
                  placeholder={t('dashboard.goals.monthly_placeholder') || 'e.g. 50'}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#111] border border-black/10 dark:border-[rgba(255,255,255,0.06)] rounded-lg text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="yearly-goal-input"
                  className="block text-xs font-medium text-zinc-500 dark:text-[#A1A1AA] mb-1.5"
                >
                  {t('dashboard.goals.yearly') || 'Yearly Target'}
                </label>
                <input
                  id="yearly-goal-input"
                  type="number"
                  min="1"
                  value={editYearly}
                  onChange={(e) => setEditYearly(e.target.value)}
                  placeholder={t('dashboard.goals.yearly_placeholder') || 'e.g. 1000'}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-[#111] border border-black/10 dark:border-[rgba(255,255,255,0.06)] rounded-lg text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 text-xs font-medium bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check size={12} />
                {t('dashboard.goals.save') || 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="py-2 px-3 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="display-stats"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            {/* Monthly Goal progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-medium text-zinc-500 dark:text-[#A1A1AA]">
                  {t('dashboard.goals.monthly') || 'Monthly Target'}
                </span>
                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                  {isInitialLoad ? (
                    <span className="inline-block w-14 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  ) : (
                    <>
                      {monthlyContributions} / {goals.monthly}
                    </>
                  )}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-zinc-900 overflow-hidden relative border border-black/5 dark:border-[rgba(255,255,255,0.03)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: isInitialLoad ? '0%' : `${monthlyPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 dark:text-[#777]">
                  {isInitialLoad ? (
                    <span className="inline-block w-24 h-2.5 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  ) : monthlyRemaining > 0 ? (
                    (t('dashboard.goals.remaining') || '{{count}} commits remaining').replace(
                      '{{count}}',
                      monthlyRemaining.toString()
                    )
                  ) : (
                    t('dashboard.goals.completed') || 'Goal Achieved! 🎉'
                  )}
                </span>
                <span className="font-semibold text-emerald-500 dark:text-emerald-400">
                  {isInitialLoad ? '—' : `${monthlyPercent}%`}
                </span>
              </div>
            </div>

            {/* Yearly Goal progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-medium text-zinc-500 dark:text-[#A1A1AA]">
                  {t('dashboard.goals.yearly') || 'Yearly Target'}
                </span>
                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                  {isInitialLoad ? (
                    <span className="inline-block w-14 h-3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  ) : (
                    <>
                      {yearlyContributions} / {goals.yearly}
                    </>
                  )}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-zinc-900 overflow-hidden relative border border-black/5 dark:border-[rgba(255,255,255,0.03)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: isInitialLoad ? '0%' : `${yearlyPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 dark:text-[#777]">
                  {isInitialLoad ? (
                    <span className="inline-block w-24 h-2.5 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  ) : yearlyRemaining > 0 ? (
                    (t('dashboard.goals.remaining') || '{{count}} commits remaining').replace(
                      '{{count}}',
                      yearlyRemaining.toString()
                    )
                  ) : (
                    t('dashboard.goals.completed') || 'Goal Achieved! 🎉'
                  )}
                </span>
                <span className="font-semibold text-emerald-500 dark:text-emerald-400">
                  {isInitialLoad ? '—' : `${yearlyPercent}%`}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
