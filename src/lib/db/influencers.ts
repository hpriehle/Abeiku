import { supabase } from "@/lib/supabase/client";

export interface Influencer {
  id: string;
  hotel_id: string;
  slug: string;
  name: string;
  email: string;
  password_hash: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  redirect_url: string;
  created_at: string;
  last_login_at: string | null;
}

export interface InfluencerClick {
  id: string;
  influencer_id: string;
  clicked_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
}

export interface ClickStatsRow {
  date: string;
  count: number;
}

const RESERVED_SLUGS = new Set([
  "admin", "api", "partner", "about", "contact", "rooms", "reserve",
  "_next", "images", "favicon.ico", "robots.txt", "sitemap.xml",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{2,40}$/i.test(slug) && !isReservedSlug(slug);
}

export async function createInfluencer(input: {
  hotel_id: string;
  slug: string;
  name: string;
  email: string;
  invite_token: string;
  invite_expires_at: string;
  redirect_url?: string;
}): Promise<Influencer> {
  const { data, error } = await supabase
    .from("influencers")
    .insert({
      hotel_id: input.hotel_id,
      slug: input.slug.toLowerCase(),
      name: input.name,
      email: input.email.toLowerCase(),
      invite_token: input.invite_token,
      invite_expires_at: input.invite_expires_at,
      redirect_url: input.redirect_url ?? "/",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listInfluencersForHotel(hotelId: string): Promise<Influencer[]> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getInfluencerBySlug(hotelId: string, slug: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInfluencerByEmail(email: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInfluencerById(id: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInfluencerByInviteToken(token: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setInfluencerPassword(id: string, password_hash: string): Promise<void> {
  const { error } = await supabase
    .from("influencers")
    .update({ password_hash, invite_token: null, invite_expires_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function markInfluencerLogin(id: string): Promise<void> {
  const { error } = await supabase
    .from("influencers")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function logClick(input: {
  influencer_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
}): Promise<void> {
  const { error } = await supabase.from("influencer_clicks").insert({
    influencer_id: input.influencer_id,
    ip_hash: input.ip_hash,
    user_agent: input.user_agent,
    referer: input.referer,
    country: input.country,
  });
  if (error) throw error;
}

export async function getTotalClicks(influencerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("influencer_clicks")
    .select("id", { count: "exact", head: true })
    .eq("influencer_id", influencerId);
  if (error) throw error;
  return count ?? 0;
}

export async function getClicksByDay(influencerId: string, days: number): Promise<ClickStatsRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("influencer_clicks")
    .select("clicked_at")
    .eq("influencer_id", influencerId)
    .gte("clicked_at", since);
  if (error) throw error;

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of data ?? []) {
    const day = (row.clicked_at as string).slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRecentClicks(influencerId: string, limit: number): Promise<InfluencerClick[]> {
  const { data, error } = await supabase
    .from("influencer_clicks")
    .select("*")
    .eq("influencer_id", influencerId)
    .order("clicked_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getClickCountsByInfluencer(hotelId: string): Promise<Map<string, number>> {
  const { data: influencers, error: e1 } = await supabase
    .from("influencers")
    .select("id")
    .eq("hotel_id", hotelId);
  if (e1) throw e1;
  const ids = (influencers ?? []).map((i) => i.id);
  if (ids.length === 0) return new Map();

  const { data: clicks, error: e2 } = await supabase
    .from("influencer_clicks")
    .select("influencer_id")
    .in("influencer_id", ids);
  if (e2) throw e2;

  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, 0);
  for (const row of clicks ?? []) {
    counts.set(row.influencer_id, (counts.get(row.influencer_id) ?? 0) + 1);
  }
  return counts;
}
