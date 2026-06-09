import type { KulwaSummary, KulwaQuestion, KulwaQuestionsResponse, KulwaUsersResponse, DayFilter, KulwaOverview, KulwaConversation, KulwaConversationsResponse, KulwaTopics } from '../types';
import { cacheGet, cacheGetStale, cacheIsFresh, cacheSet, cacheBust } from '../lib/cache';

const BASE    = import.meta.env.VITE_KULWA_BASE_URL || '';
const API_KEY = import.meta.env.VITE_KULWA_API_KEY ?? '';

function headers(): HeadersInit {
  return { 'X-Insights-Key': API_KEY };
}

function url(path: string): string {
  return BASE ? `${BASE}${path}` : `/kulwa-api${path}`;
}

function fetchWithTimeout(input: string, init: RequestInit, ms = 30_000): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

export function bustKulwaCache() {
  cacheBust('kulwa:');
}

// ─── Peek helpers (stale-while-revalidate) ────────────────────────

export function peekKulwaOverview(days: number): KulwaOverview | null {
  return cacheGetStale<KulwaOverview>(`kulwa:overview:${days}`);
}
export function isFreshKulwaOverview(days: number): boolean {
  return cacheIsFresh(`kulwa:overview:${days}`);
}

export function peekKulwaSummary(days: DayFilter): KulwaSummary | null {
  return cacheGetStale<KulwaSummary>(`kulwa:summary:${days}`);
}
export function isFreshKulwaSummary(days: DayFilter): boolean {
  return cacheIsFresh(`kulwa:summary:${days}`);
}

export function peekKulwaQuestions(days: DayFilter, limit: number, offset: number, intent?: string): KulwaQuestionsResponse | null {
  return cacheGetStale<KulwaQuestionsResponse>(`kulwa:questions:${days}:${limit}:${offset}:${intent ?? ''}`);
}
export function isFreshKulwaQuestions(days: DayFilter, limit: number, offset: number, intent?: string): boolean {
  return cacheIsFresh(`kulwa:questions:${days}:${limit}:${offset}:${intent ?? ''}`);
}

export function peekKulwaUsers(days: DayFilter, limit: number, offset: number): KulwaUsersResponse | null {
  return cacheGetStale<KulwaUsersResponse>(`kulwa:users:${days}:${limit}:${offset}`);
}
export function isFreshKulwaUsers(days: DayFilter, limit: number, offset: number): boolean {
  return cacheIsFresh(`kulwa:users:${days}:${limit}:${offset}`);
}

export function peekKulwaTopics(days: number): KulwaTopics | null {
  return cacheGetStale<KulwaTopics>(`kulwa:topics:${days}`);
}
export function isFreshKulwaTopics(days: number): boolean {
  return cacheIsFresh(`kulwa:topics:${days}`);
}

export function peekKulwaConversations(days: number, limit: number, offset: number, status: string, intent: string, search: string, closingState = ''): KulwaConversationsResponse | null {
  return cacheGetStale<KulwaConversationsResponse>(`kulwa:conversations:${days}:${limit}:${offset}:${status}:${intent}:${search}:${closingState}`);
}
export function isFreshKulwaConversations(days: number, limit: number, offset: number, status: string, intent: string, search: string, closingState = ''): boolean {
  return cacheIsFresh(`kulwa:conversations:${days}:${limit}:${offset}:${status}:${intent}:${search}:${closingState}`);
}

// ─── Fetch functions ──────────────────────────────────────────────

export async function fetchKulwaSummary(days: DayFilter): Promise<KulwaSummary> {
  const key = `kulwa:summary:${days}`;
  const hit = cacheGet<KulwaSummary>(key);
  if (hit) return hit;

  const params = days ? `?days=${days}` : '';
  const res = await fetchWithTimeout(url(`/insights/summary${params}`), { headers: headers() });
  if (!res.ok) throw new Error(`Kulwa summary: ${res.status} ${res.statusText}`);
  const data: KulwaSummary = await res.json();
  cacheSet(key, data);
  return data;
}

export async function fetchKulwaQuestions(
  days: DayFilter,
  limit = 50,
  offset = 0,
  intent?: string,
): Promise<KulwaQuestionsResponse> {
  const key = `kulwa:questions:${days}:${limit}:${offset}:${intent ?? ''}`;
  const hit = cacheGet<KulwaQuestionsResponse>(key);
  if (hit) return hit;

  const params = new URLSearchParams();
  if (days)   params.set('days',   String(days));
  if (intent) params.set('intent', intent);
  params.set('limit',  String(limit));
  params.set('offset', String(offset));

  const res = await fetchWithTimeout(url(`/insights/questions?${params}`), { headers: headers() });
  if (!res.ok) throw new Error(`Kulwa questions: ${res.status} ${res.statusText}`);
  const data: KulwaQuestionsResponse = await res.json();
  cacheSet(key, data);
  return data;
}

export async function fetchKulwaUsers(
  days: DayFilter,
  limit = 50,
  offset = 0,
): Promise<KulwaUsersResponse> {
  const key = `kulwa:users:${days}:${limit}:${offset}`;
  const hit = cacheGet<KulwaUsersResponse>(key);
  if (hit) return hit;

  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  params.set('limit',  String(limit));
  params.set('offset', String(offset));

  const res = await fetchWithTimeout(url(`/insights/users?${params}`), { headers: headers() });
  if (!res.ok) throw new Error(`Kulwa users: ${res.status} ${res.statusText}`);
  const data: KulwaUsersResponse = await res.json();
  cacheSet(key, data);
  return data;
}

export async function fetchKulwaOverview(days: number): Promise<KulwaOverview> {
  const key = `kulwa:overview:${days}`;
  const hit = cacheGet<KulwaOverview>(key);
  if (hit) return hit;

  const res = await fetchWithTimeout(url(`/insights/overview?days=${days}`), { headers: headers() }, 40_000);
  if (!res.ok) throw new Error(`Kulwa overview: ${res.status} ${res.statusText}`);
  const data: KulwaOverview = await res.json();
  cacheSet(key, data);
  return data;
}

export async function fetchKulwaConversations(
  days: number,
  limit = 50,
  offset = 0,
  status = '',
  intent = '',
  search = '',
  closingState = '',
): Promise<KulwaConversationsResponse> {
  const key = `kulwa:conversations:${days}:${limit}:${offset}:${status}:${intent}:${search}:${closingState}`;
  const hit = cacheGet<KulwaConversationsResponse>(key);
  if (hit) return hit;

  const params = new URLSearchParams();
  params.set('days',   String(days));
  params.set('limit',  String(limit));
  params.set('offset', String(offset));
  if (status)       params.set('status',        status);
  if (intent)       params.set('intent',         intent);
  if (search)       params.set('search',         search);
  if (closingState) params.set('closing_state',  closingState);

  const res = await fetchWithTimeout(url(`/insights/conversations?${params}`), { headers: headers() });
  if (!res.ok) throw new Error(`Kulwa conversations: ${res.status} ${res.statusText}`);
  const data: KulwaConversationsResponse = await res.json();
  cacheSet(key, data);
  return data;
}

export async function fetchKulwaTopics(days: number): Promise<KulwaTopics> {
  const key = `kulwa:topics:${days}`;
  const hit = cacheGet<KulwaTopics>(key);
  if (hit) return hit;

  const res = await fetchWithTimeout(url(`/insights/topics?days=${days}`), { headers: headers() });
  if (!res.ok) throw new Error(`Kulwa topics: ${res.status} ${res.statusText}`);
  const data: KulwaTopics = await res.json();
  cacheSet(key, data);
  return data;
}

// ─── Fetch-all helpers (paginate with server-safe limit, cache combined) ──────

const BATCH = 50;

export function peekAllKulwaConversations(days: number): KulwaConversation[] | null {
  return cacheGetStale<KulwaConversation[]>(`kulwa:all:conversations:${days}`);
}
export function isFreshAllKulwaConversations(days: number): boolean {
  return cacheIsFresh(`kulwa:all:conversations:${days}`);
}

export function peekAllKulwaQuestions(days: DayFilter): KulwaQuestion[] | null {
  return cacheGetStale<KulwaQuestion[]>(`kulwa:all:questions:${days}`);
}
export function isFreshAllKulwaQuestions(days: DayFilter): boolean {
  return cacheIsFresh(`kulwa:all:questions:${days}`);
}

export async function fetchAllKulwaConversations(days: number): Promise<KulwaConversation[]> {
  const key = `kulwa:all:conversations:${days}`;
  const hit = cacheGet<KulwaConversation[]>(key);
  if (hit) return hit;

  const first = await fetchKulwaConversations(days, BATCH, 0, '', '', '');
  const total = first.total;
  const all: KulwaConversation[] = [...first.data];

  if (total > BATCH) {
    const pages = Math.ceil((total - BATCH) / BATCH);
    const rest = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        fetchKulwaConversations(days, BATCH, (i + 1) * BATCH, '', '', '')
      )
    );
    rest.forEach(r => all.push(...r.data));
  }

  cacheSet(key, all);
  return all;
}

export async function fetchAllKulwaQuestions(days: DayFilter): Promise<KulwaQuestion[]> {
  const key = `kulwa:all:questions:${days}`;
  const hit = cacheGet<KulwaQuestion[]>(key);
  if (hit) return hit;

  const first = await fetchKulwaQuestions(days, BATCH, 0);
  const total = first.total;
  const all: KulwaQuestion[] = [...first.data];

  if (total > BATCH) {
    const pages = Math.ceil((total - BATCH) / BATCH);
    const rest = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        fetchKulwaQuestions(days, BATCH, (i + 1) * BATCH)
      )
    );
    rest.forEach(r => all.push(...r.data));
  }

  cacheSet(key, all);
  return all;
}

/** Prefetch all default views in parallel. Resolves when all settle (never rejects). */
export function prefetchKulwa(): Promise<void> {
  return Promise.allSettled([
    fetchKulwaOverview(7),
    fetchKulwaSummary(7),
    fetchAllKulwaQuestions(7),
    fetchKulwaUsers(7, 50, 0),
    fetchKulwaTopics(7),
    fetchAllKulwaConversations(7),
  ]).then(() => {});
}
