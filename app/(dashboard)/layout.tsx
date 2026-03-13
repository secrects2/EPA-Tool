'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface Profile {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    organization: string | null
    role: string | null
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        const supabase = createClient()

        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }
            setUser(user)

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (profileData) setProfile(profileData)
        }

        getUser()
    }, [router])

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }

    const navItems = [
        { href: '/dashboard', label: '儀表板', icon: '📊' },
        { href: '/elders', label: '長輩管理', icon: '👥' },
        ...(profile?.role === 'admin' ? [{ href: '/admin', label: '管理員', icon: '🔑' }] : []),
    ]

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 glass-card rounded-none lg:rounded-r-2xl border-r border-white/5 flex flex-col transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
                {/* Logo */}
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: 'var(--gradient-primary)' }}>
                            E
                        </div>
                        <div>
                            <h1 className="font-bold text-white text-lg">EPA Tool</h1>
                            <p className="text-xs text-slate-500">AI 動作分析</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`sidebar-item ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}`}
                        >
                            <span className="text-lg">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                {/* User profile */}
                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold">
                                {profile?.full_name?.[0] || '?'}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{profile?.full_name || '指導員'}</p>
                            <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full text-left text-sm text-slate-400 hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5"
                    >
                        🚪 退出登入
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-h-screen">
                {/* Mobile header */}
                <header className="lg:hidden sticky top-0 z-30 glass-card rounded-none border-b border-white/5 px-4 py-3 flex items-center justify-between">
                    <button onClick={() => setSidebarOpen(true)} className="text-white p-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <span className="font-bold text-white">EPA Tool</span>
                    <div className="w-8" />
                </header>

                <div className="p-4 md:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
