import PhoneChat from '@/components/PhoneChat'
import WaitlistForm from '@/components/WaitlistForm'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-white to-emerald-50/60">
      {/* Nav */}
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight text-gray-900">Abeiku</span>
          <a
            href="/admin/login"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1.5"
          >
            Log in
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-28 pb-20 sm:pt-32">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Phone */}
          <div className="flex-shrink-0 order-1 lg:order-none">
            <PhoneChat />
          </div>

          {/* Content */}
          <div className="max-w-lg text-center lg:text-left order-0 lg:order-none">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium mb-6">
              <span>🇬🇭</span>
              <span>Built for Ghana</span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900 mb-3">
              Abeiku
            </h1>

            <p className="text-xl sm:text-2xl text-gray-500 mb-6 font-light">
              Hotel booking on WhatsApp
            </p>

            <p className="text-gray-500 mb-8 leading-relaxed max-w-md mx-auto lg:mx-0">
              Guests book rooms, pay with Mobile Money or card, and chat with your hotel — all through WhatsApp. No app downloads. No complicated websites.
            </p>

            <WaitlistForm />

            <p className="text-xs text-gray-400 mt-4">
              Join hotels across Ghana getting ready for launch.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <span>&copy; {new Date().getFullYear()} Abeiku. All rights reserved.</span>
          <span>Made in Accra</span>
        </div>
      </footer>
    </div>
  )
}
