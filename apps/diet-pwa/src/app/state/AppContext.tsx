/**
 * Application data provider: PIN gate, food library and settings.
 *
 * The daily plan lives in the Today page (it is per-day state); everything
 * shared between pages lives here.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api';
import type { AuthStatus, Food, FoodInput, Settings, SettingsInput } from '../../shared/types';

export type AppStatus = 'loading' | 'locked' | 'ready' | 'error';

interface AppContextValue {
  status: AppStatus;
  pinConfigured: boolean;
  authError: string | null;
  fatalError: string | null;
  foods: Food[];
  settings: Settings | null;
  toast: string | null;
  unlock: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
  notify: (message: string) => void;
  refreshFoods: () => Promise<void>;
  saveSettings: (patch: Partial<SettingsInput>) => Promise<void>;
  createFood: (input: FoodInput) => Promise<void>;
  updateFood: (id: number, input: FoodInput) => Promise<void>;
  removeFood: (id: number) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [auth, setAuth] = useState<AuthStatus>({ pinConfigured: false, authenticated: false });
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const describe = (error: unknown): string =>
    error instanceof ApiError ? error.message : '网络请求失败，请检查连接后重试';

  const loadData = useCallback(async () => {
    const [foodsResponse, settingsResponse] = await Promise.all([api.listFoods(), api.getSettings()]);
    setFoods(foodsResponse.foods);
    setSettings(settingsResponse.settings);
    setStatus('ready');
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const authStatus = await api.authStatus();
      setAuth(authStatus);
      if (!authStatus.authenticated) {
        setStatus('locked');
        return;
      }
      await loadData();
    } catch (error) {
      setFatalError(describe(error));
      setStatus('error');
    }
  }, [loadData]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const unlock = useCallback(
    async (pin: string) => {
      setAuthError(null);
      try {
        await api.unlock(pin);
        setAuth({ pinConfigured: true, authenticated: true });
        await loadData();
      } catch (error) {
        setAuthError(error instanceof ApiError ? error.message : '解锁失败，请重试');
        throw error;
      }
    },
    [loadData],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setStatus('locked');
    setAuth({ pinConfigured: true, authenticated: false });
    setFoods([]);
  }, []);

  const refreshFoods = useCallback(async () => {
    const response = await api.listFoods();
    setFoods(response.foods);
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<SettingsInput>) => {
      if (!settings) return;
      const merged: SettingsInput = {
        currentWeightKg: patch.currentWeightKg ?? settings.currentWeightKg,
        baseWeightKg: patch.baseWeightKg ?? settings.baseWeightKg,
        baseCalories: patch.baseCalories ?? settings.baseCalories,
        defaultCalories: patch.defaultCalories ?? settings.defaultCalories,
        defaultTrainingDay: patch.defaultTrainingDay ?? settings.defaultTrainingDay,
        defaultTrainingAfterMeal: patch.defaultTrainingAfterMeal ?? settings.defaultTrainingAfterMeal,
      };
      try {
        const response = await api.saveSettings(merged);
        setSettings(response.settings);
        notify('设置已保存');
      } catch (error) {
        notify(describe(error));
      }
    },
    [notify, settings],
  );

  const createFood = useCallback(
    async (input: FoodInput) => {
      await api.createFood(input);
      await refreshFoods();
      notify('食物已添加');
    },
    [notify, refreshFoods],
  );

  const updateFood = useCallback(
    async (id: number, input: FoodInput) => {
      await api.updateFood(id, input);
      await refreshFoods();
      notify('食物已更新');
    },
    [notify, refreshFoods],
  );

  const removeFood = useCallback(
    async (id: number) => {
      await api.deleteFood(id);
      await refreshFoods();
      notify('食物已删除');
    },
    [notify, refreshFoods],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      pinConfigured: auth.pinConfigured,
      authError,
      fatalError,
      foods,
      settings,
      toast,
      unlock,
      logout,
      notify,
      refreshFoods,
      saveSettings,
      createFood,
      updateFood,
      removeFood,
    }),
    [
      status,
      auth.pinConfigured,
      authError,
      fatalError,
      foods,
      settings,
      toast,
      unlock,
      logout,
      notify,
      refreshFoods,
      saveSettings,
      createFood,
      updateFood,
      removeFood,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
