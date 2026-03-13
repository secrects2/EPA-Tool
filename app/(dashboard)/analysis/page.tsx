'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Elder {
    id: string
    name: string
    gender: string | null
    birth_date: string | null
    notes: string | null
    session_count: number
}

export default function AnalysisListPage() {
    const [elders, setElders] = useState<Elder[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        const fetch = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data } = await supabase
                .from('elders')
                .select('*, analysis_sessions(id)')
                .eq('instructor_id', user.id)
                .order('created_at', { ascending: false })

            if (data) {
                setElders(data.map(e => ({
                    ...e,
                    session_count: (e.analysis_sessions as any[])?.length || 0,
                })))
            }
            setLoading(false)
        }
        fetch()
    }, [])

    const filtered = elders.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">🎳 地板滾球分析</h1>
                <p className="text-slate-400 text-sm mt-1">選擇長輩進行 AI 動作分析</p>
            </div>

            {/* Search */}
            <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="搜尋長輩姓名..."
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none transition-colors"
                />
            </div>

            {/* Elder Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 glass-card animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-5xl mb-4">🎳</p>
                    <p className="text-white font-medium">尚無長輩資料</p>
                    <p className="text-sm text-slate-400 mt-1">請先至「長輩管理」新增長輩</p>
                    <Link href="/elders?add=true" className="btn-accent text-sm mt-4 inline-block">
                        + 新增長輩
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(elder => (
                        <Link
                            key={elder.id}
                            href={`/analysis/${elder.id}`}
                            className="glass-card p-5 hover:bg-white/10 transition-all hover:scale-[1.01] group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white ${elder.gender === 'female' ? 'bg-pink-600/60' : 'bg-blue-600/60'}`}>
                                        {elder.name[0]}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white group-hover:text-primary-400 transition-colors">{elder.name}</h3>
                                        <p className="text-xs text-slate-500">
                                            {elder.gender === 'female' ? '女' : '男'}
                                            {elder.birth_date && ` · ${elder.birth_date}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-primary-400 font-bold">{elder.session_count}</p>
                                    <p className="text-[10px] text-slate-600">分析次數</p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
