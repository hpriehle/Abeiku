'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type BotMessage = { type: 'bot'; text: string }
type UserMessage = { type: 'user'; text: string }
type ButtonsMessage = { type: 'buttons'; options: string[] }
type CalendarMessage = { type: 'calendar' }
type SummaryMessage = { type: 'summary' }
type Message = BotMessage | UserMessage | ButtonsMessage | CalendarMessage | SummaryMessage

export default function PhoneChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [pressedButton, setPressedButton] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<number[]>([])
  const chatRef = useRef<HTMLDivElement>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const scrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [])

  const runScript = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t))
    timeoutsRef.current = []
    setMessages([])
    setIsTyping(false)
    setPressedButton(null)
    setSelectedDates([])

    const schedule = (fn: () => void, delay: number) => {
      const t = setTimeout(() => { fn(); scrollToBottom() }, delay)
      timeoutsRef.current.push(t)
    }

    let t = 500

    // Bot welcome
    schedule(() => setIsTyping(true), t)
    t += 900
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'bot', text: 'Welcome to Aracuya Hotel! 🏨\nHow can I help you today?' }])
    }, t)
    t += 500

    // Options buttons
    schedule(() => setIsTyping(true), t)
    t += 600
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'buttons', options: ['📅 Book a Room', '🔍 Check Availability', '💬 Talk to Hotel'] }])
    }, t)
    t += 1300

    // Press "Book a Room"
    schedule(() => setPressedButton('📅 Book a Room'), t)
    t += 600
    schedule(() => {
      setPressedButton(null)
      setMessages(prev => [...prev, { type: 'user', text: '📅 Book a Room' }])
    }, t)
    t += 500

    // Room options
    schedule(() => setIsTyping(true), t)
    t += 900
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'bot', text: 'Great choice! Here are our rooms:' }])
    }, t)
    t += 400
    schedule(() => setIsTyping(true), t)
    t += 500
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'buttons', options: ['🛏️ Standard — GH₵250/night', '✨ Deluxe Suite — GH₵450/night'] }])
    }, t)
    t += 1300

    // Press "Deluxe Suite"
    schedule(() => setPressedButton('✨ Deluxe Suite — GH₵450/night'), t)
    t += 600
    schedule(() => {
      setPressedButton(null)
      setMessages(prev => [...prev, { type: 'user', text: '✨ Deluxe Suite — GH₵450/night' }])
    }, t)
    t += 500

    // Calendar prompt
    schedule(() => setIsTyping(true), t)
    t += 800
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'bot', text: 'Excellent choice! 🌟\nSelect your dates:' }])
    }, t)
    t += 400
    schedule(() => {
      setMessages(prev => [...prev, { type: 'calendar' }])
    }, t)
    t += 700

    // Animate date selection
    schedule(() => setSelectedDates([14]), t)
    t += 500
    schedule(() => setSelectedDates([14, 15]), t)
    t += 400
    schedule(() => setSelectedDates([14, 15, 16]), t)
    t += 900

    // User confirms dates
    schedule(() => {
      setMessages(prev => [...prev, { type: 'user', text: 'Feb 14 → Feb 16 (2 nights)' }])
    }, t)
    t += 500

    // Booking summary
    schedule(() => setIsTyping(true), t)
    t += 1000
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'summary' }])
    }, t)
    t += 400
    schedule(() => {
      setMessages(prev => [...prev, { type: 'buttons', options: ['💳 Pay with Card', '📱 Mobile Money'] }])
    }, t)
    t += 1300

    // Press Mobile Money
    schedule(() => setPressedButton('📱 Mobile Money'), t)
    t += 600
    schedule(() => {
      setPressedButton(null)
      setMessages(prev => [...prev, { type: 'user', text: '📱 Mobile Money' }])
    }, t)
    t += 500

    // Confirmation
    schedule(() => setIsTyping(true), t)
    t += 1100
    schedule(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, {
        type: 'bot',
        text: '✅ Booking Confirmed!\n\nDeluxe Suite at Aracuya Hotel\nFeb 14–16, 2026\nTotal: GH₵900\n\nConfirmation sent to your phone.\nSee you soon! 🎉'
      }])
    }, t)
    t += 4500

    // Loop
    schedule(() => runScript(), t)
  }, [scrollToBottom])

  useEffect(() => {
    runScript()
    return () => { timeoutsRef.current.forEach(t => clearTimeout(t)) }
  }, [runScript])

  const MiniCalendar = () => {
    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    // Feb 2026 starts on Sunday → offset 6 in Mon-first grid
    const firstDayOffset = 6
    const daysInMonth = 28

    return (
      <div className="bg-white rounded-lg p-2 text-[10px] w-full max-w-[200px]">
        <div className="text-center font-semibold text-gray-800 mb-1 text-[11px]">February 2026</div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {days.map(d => (
            <div key={d} className="text-gray-400 font-medium py-0.5">{d}</div>
          ))}
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`e-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const isSelected = selectedDates.includes(day)
            const isEndpoint = day === selectedDates[0] || day === selectedDates[selectedDates.length - 1]
            return (
              <div
                key={day}
                className={`py-0.5 rounded transition-all duration-300 ${
                  isSelected
                    ? isEndpoint
                      ? 'bg-[#075E54] text-white font-bold'
                      : 'bg-[#25D366]/30 text-gray-800'
                    : 'text-gray-600'
                }`}
              >
                {day}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const time = '10:32'

  return (
    <div className="relative mx-auto w-[280px] h-[560px] sm:w-[300px] sm:h-[600px] lg:w-[320px] lg:h-[640px]">
      {/* Phone frame */}
      <div className="absolute inset-0 bg-gray-900 rounded-[2.8rem] shadow-2xl shadow-black/25 border-[3px] border-gray-700">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-b-2xl z-20" />

        {/* Screen */}
        <div className="absolute inset-[3px] rounded-[2.6rem] overflow-hidden bg-[#ECE5DD] flex flex-col">
          {/* Status bar */}
          <div className="bg-[#065048] text-white px-6 pt-2 pb-0 flex items-center justify-between text-[10px]">
            <span>{time}</span>
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M2 22h20V2z" opacity=".3"/><path d="M12 12V2L2 22h20z"/></svg>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.34C7 21.4 7.6 22 8.33 22h7.34c.73 0 1.33-.6 1.33-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
            </div>
          </div>

          {/* WhatsApp header */}
          <div className="bg-[#075E54] text-white px-3 pt-1 pb-2.5 flex items-center gap-2.5">
            <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
            <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center text-sm font-bold flex-shrink-0">A</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Aracuya Hotel</div>
              <div className="text-[10px] opacity-70">online</div>
            </div>
            <div className="ml-auto flex items-center gap-3 opacity-80">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </div>
          </div>

          {/* Chat area */}
          <div ref={chatRef} className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 scroll-smooth">
            {messages.map((msg, i) => {
              if (msg.type === 'bot') {
                return (
                  <div key={i} className="flex justify-start animate-fade-in">
                    <div className="bg-white rounded-lg rounded-tl-none px-2.5 py-1.5 max-w-[85%] shadow-sm">
                      <p className="text-[11.5px] text-gray-800 whitespace-pre-line leading-relaxed">{msg.text}</p>
                      <span className="text-[9px] text-gray-400 float-right mt-0.5 ml-2">{time}</span>
                    </div>
                  </div>
                )
              }
              if (msg.type === 'user') {
                return (
                  <div key={i} className="flex justify-end animate-fade-in">
                    <div className="bg-[#DCF8C6] rounded-lg rounded-tr-none px-2.5 py-1.5 max-w-[85%] shadow-sm">
                      <p className="text-[11.5px] text-gray-800">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className="text-[9px] text-gray-400">{time}</span>
                        <svg className="w-3 h-3 text-[#53BDEB]" fill="currentColor" viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>
                      </div>
                    </div>
                  </div>
                )
              }
              if (msg.type === 'buttons') {
                return (
                  <div key={i} className="flex flex-col gap-1 px-1 animate-fade-in">
                    {msg.options.map(opt => (
                      <div
                        key={opt}
                        className={`text-[11.5px] px-3 py-2 rounded-lg border text-center transition-all duration-300 ${
                          pressedButton === opt
                            ? 'bg-[#25D366] text-white border-[#25D366] scale-[0.97]'
                            : 'bg-white text-[#075E54] border-[#075E54]/20'
                        }`}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )
              }
              if (msg.type === 'calendar') {
                return (
                  <div key={i} className="flex justify-start animate-fade-in">
                    <MiniCalendar />
                  </div>
                )
              }
              if (msg.type === 'summary') {
                return (
                  <div key={i} className="flex justify-start animate-fade-in">
                    <div className="bg-white rounded-lg rounded-tl-none px-2.5 py-2 max-w-[85%] shadow-sm">
                      <p className="text-[11px] font-semibold text-gray-800 mb-1">📋 Booking Summary</p>
                      <div className="text-[11px] text-gray-600 space-y-0.5">
                        <p>✨ Deluxe Suite</p>
                        <p>📅 Feb 14 – Feb 16 (2 nights)</p>
                        <p>💰 GH₵900 total</p>
                      </div>
                      <p className="text-[11px] text-gray-800 mt-1.5">How would you like to pay?</p>
                      <span className="text-[9px] text-gray-400 float-right mt-0.5">{time}</span>
                    </div>
                  </div>
                )
              }
              return null
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-white rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="bg-[#F0F0F0] px-2 py-1.5 flex items-center gap-1.5">
            <svg className="w-6 h-6 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
            <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[11px] text-gray-400">
              Type a message
            </div>
            <svg className="w-6 h-6 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
          </div>
        </div>
      </div>

      {/* Subtle phone glow */}
      <div className="absolute -inset-4 bg-[#25D366]/10 rounded-[3.5rem] blur-2xl -z-10" />
    </div>
  )
}
