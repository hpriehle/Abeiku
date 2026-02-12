'use client'

import { useState, type FormEvent } from 'react'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    // TODO: POST to /api/waitlist to store in Supabase
    await new Promise(r => setTimeout(r, 800))
    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="animate-fade-in rounded-xl bg-emerald-50 border border-emerald-200 px-6 py-5">
        <p className="text-emerald-800 font-semibold text-lg">You&apos;re on the list!</p>
        <p className="text-emerald-600 text-sm mt-1">We&apos;ll reach out when Abeiku launches in your area.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@hotel.com"
        className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366] transition-shadow"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-[#2D4A3E] px-6 py-3 text-white text-sm font-semibold hover:bg-[#1E3329] transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"
      >
        {loading ? 'Joining...' : 'Join the Waitlist'}
      </button>
    </form>
  )
}
