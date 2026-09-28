/** Typed fetch client for the Worker API. */

import type {
  AuthStatus,
  DailyRecord,
  DailyRecordWithPlan,
  Food,
  FoodInput,
  MealPlan,
  Settings,
  SettingsInput,
} from '../shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });

  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: string; message?: string } | null;
    throw new ApiError(response.status, body?.error ?? 'request_failed', body?.message ?? '请求失败，请稍后重试');
  }

  return payload as T;
}

export interface SaveRecordPayload {
  weightKg: number;
  trainingDay: boolean;
  trainingAfterMeal: string;
  targetCalories: number;
  calorieTargetManual: boolean;
  plan: MealPlan;
}

export const api = {
  authStatus: () => request<AuthStatus>('/api/auth/status'),
  unlock: (pin: string) => request<{ ok: boolean; created: boolean }>('/api/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  changePin: (pin: string, newPin: string) =>
    request<{ ok: boolean }>('/api/auth/pin/change', { method: 'POST', body: JSON.stringify({ pin, newPin }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  listFoods: () => request<{ foods: Food[] }>('/api/foods'),
  createFood: (food: FoodInput) => request<{ food: Food }>('/api/foods', { method: 'POST', body: JSON.stringify(food) }),
  updateFood: (id: number, food: FoodInput) =>
    request<{ food: Food }>(`/api/foods/${id}`, { method: 'PUT', body: JSON.stringify(food) }),
  deleteFood: (id: number) => request<{ ok: boolean }>(`/api/foods/${id}`, { method: 'DELETE' }),

  getSettings: () => request<{ settings: Settings }>('/api/settings'),
  saveSettings: (settings: SettingsInput) =>
    request<{ settings: Settings }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  getRecord: (date: string) => request<{ record: DailyRecordWithPlan | null }>(`/api/records/${date}`),
  listRecords: (days: number) => request<{ records: DailyRecord[] }>(`/api/records?days=${days}`),
  saveRecord: (date: string, payload: SaveRecordPayload) =>
    request<{ record: DailyRecordWithPlan }>(`/api/records/${date}`, { method: 'PUT', body: JSON.stringify(payload) }),
  copyRecord: (from: string, to: string) =>
    request<{ record: DailyRecordWithPlan }>('/api/records/copy', { method: 'POST', body: JSON.stringify({ from, to }) }),
};
