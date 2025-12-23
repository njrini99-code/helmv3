'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MessageCircle,
  Mail,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  Target,
  Video,
  Calendar,
  Settings,
  ArrowLeft,
} from 'lucide-react';

const faqs = [
  {
    category: 'Getting Started',
    icon: BookOpen,
    questions: [
      {
        q: 'How do I create my profile?',
        a: 'After signing up, you\'ll be guided through our onboarding process. Fill in your basic information, add your stats, and upload highlight videos to complete your profile.',
      },
      {
        q: 'What\'s the difference between coach types?',
        a: 'College coaches focus on recruiting. High school and showcase coaches manage their teams. JUCO coaches can do both - toggle between recruiting and team management modes.',
      },
      {
        q: 'How do I activate recruiting?',
        a: 'Players can activate recruiting from their dashboard. This makes your profile visible to college coaches and unlocks features like the recruiting journey tracker.',
      },
    ],
  },
  {
    category: 'For Coaches',
    icon: Users,
    questions: [
      {
        q: 'How do I find players?',
        a: 'Use the Discover page to search and filter players by position, graduation year, location, stats, and more. Save searches to quickly find new prospects.',
      },
      {
        q: 'What is the Pipeline?',
        a: 'The Pipeline helps you organize recruits by stage: Watchlist, High Priority, Offer Extended, and Committed. Drag and drop players between stages to track your recruiting progress.',
      },
      {
        q: 'How do I message players?',
        a: 'Click on any player profile and use the "Send Message" button. Messages appear in your inbox and the player will be notified.',
      },
    ],
  },
  {
    category: 'For Players',
    icon: Target,
    questions: [
      {
        q: 'Who can see my profile?',
        a: 'When recruiting is activated, college coaches can find and view your profile. You can control privacy settings to hide specific information.',
      },
      {
        q: 'How do I know if coaches are interested?',
        a: 'Check your analytics to see profile views. The "College Interest" page shows which programs have added you to their watchlist.',
      },
      {
        q: 'Can I message coaches first?',
        a: 'Yes! Browse colleges, find programs you\'re interested in, and send messages directly to coaching staff.',
      },
    ],
  },
  {
    category: 'Videos & Stats',
    icon: Video,
    questions: [
      {
        q: 'What video formats are supported?',
        a: 'We support MP4, MOV, and most common video formats. Videos should be under 500MB. You can also link to YouTube or Hudl.',
      },
      {
        q: 'How do I update my stats?',
        a: 'Go to your Profile page and click "Edit" on any stats section. Keep your stats current to attract more coach attention.',
      },
    ],
  },
  {
    category: 'Team Management',
    icon: Calendar,
    questions: [
      {
        q: 'How do I add players to my roster?',
        a: 'Go to the Roster page and click "Add Player". You can invite players via email or add them manually.',
      },
      {
        q: 'Can players see team events?',
        a: 'Yes, any events you create on the Calendar are visible to your team members. They\'ll also receive notifications for upcoming events.',
      },
    ],
  },
  {
    category: 'Account & Settings',
    icon: Settings,
    questions: [
      {
        q: 'How do I change my password?',
        a: 'Go to Settings and scroll to the "Change Password" section. Enter your current password and your new password to update.',
      },
      {
        q: 'Can I switch between sports?',
        a: 'Currently, baseball and golf are separate platforms. Use the sport-specific login page to access each dashboard.',
      },
    ],
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left hover:text-green-600 transition-colors"
      >
        <span className="font-medium text-slate-900 pr-4">{question}</span>
        {isOpen ? (
          <ChevronDown size={20} className="text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={20} className="text-slate-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-4 pr-8">
          <p className="text-slate-600 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = faqs.map((category) => ({
    ...category,
    questions: category.questions.filter(
      (q) =>
        q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.a.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((category) => category.questions.length > 0);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link
            href="/baseball/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            <span>Back to Dashboard</span>
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Help Center</h1>
          <p className="text-slate-600 mt-2">
            Find answers to common questions about using Helm Sports Lab
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="relative mb-8">
          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {/* FAQ Sections */}
        <div className="space-y-6">
          {filteredFaqs.map((category) => (
            <div
              key={category.category}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <category.icon size={20} className="text-green-600" />
                <h2 className="font-semibold text-slate-900">{category.category}</h2>
              </div>
              <div className="px-6">
                {category.questions.map((item, index) => (
                  <FAQItem key={index} question={item.q} answer={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {filteredFaqs.length === 0 && (
          <div className="text-center py-12">
            <Search size={48} className="text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No results found</h3>
            <p className="text-slate-500">
              Try different keywords or contact support for help
            </p>
          </div>
        )}

        {/* Contact Section */}
        <div className="mt-12 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Still need help?</h2>
          <p className="text-slate-300 mb-6">
            Our support team is here to assist you
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:support@helmsportslab.com"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Mail size={20} />
              Email Support
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 transition-colors"
            >
              <MessageCircle size={20} />
              Live Chat
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
