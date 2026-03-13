'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'

interface Elder {
    id: string
    name: string
    gender: string | null
    birth_date: string | null
    notes: string | null
    created_at: string
    session_count?: number
}

export default function EldersPage() {
    const [elders, setElders] = useState<Elder[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ name: '', gender: 'male', birth_date: '', notes: '' })
    const [submitting, setSubmitting] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const searchParams = useSearchParams()

    // 當 URL 帶有 ?add=true 時自動展開新增表單
    useEffect(() => {
        if (searchParams.get('add') === 'true') {
            setShowForm(true)
        }
    }, [searchParams])

    const fetchElders = async () => {
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

    useEffect(() => { fetchElders() }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.name.trim()) {
            toast.error('請輸入姓名')
            return
        }
        setSubmitting(true)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase.from('elders').insert({
            instructor_id: user.id,
            name: formData.name.trim(),
            gender: formData.gender || null,
            birth_date: formData.birth_date || null,
            notes: formData.notes.trim() || null,
        })

        if (error) {
            toast.error('新增失敗: ' + error.message)
        } else {
            toast.success('長輩新增成功！')
            setFormData({ name: '', gender: 'male', birth_date: '', notes: '' })
            setShowForm(false)
            fetchElders()
        }
        setSubmitting(false)
    }

    const filteredElders = elders.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">長輩管理</h1>
                    <p className="text-slate-400 text-sm mt-1">管理您的長輩資料與分析紀錄</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
                    {showForm ? '✕ 取消' : '+ 新增長輩'}
                </button>
            </div>

            {/* Add Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
                    <h3 className="text-white font-semibold mb-2">新增長輩</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">姓名 *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none transition-colors"
                                placeholder="請輸入長輩姓名"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">性別</label>
                            <select
                                value={formData.gender}
                                onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-primary-500 focus:outline-none transition-colors"
                            >
                                <option value="male">男</option>
                                <option value="female">女</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">出生日期</label>
                            <input
                                type="date"
                                value={formData.birth_date}
                                onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-primary-500 focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">備註</label>
                            <input
                                type="text"
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none transition-colors"
                                placeholder="健康狀況、注意事項等"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={submitting} className="btn-accent text-sm disabled:opacity-50">
                            {submitting ? '儲存中...' : '✓ 儲存'}
                        </button>
                    </div>
                </form>
            )}

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

            {/* Elder List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 glass-card animate-pulse" />
                    ))}
                </div>
            ) : filteredElders.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-5xl mb-4">👥</p>
                    <p className="text-white font-medium">尚無長輩資料</p>
                    <p className="text-sm text-slate-400 mt-1">點擊上方「新增長輩」按鈕開始</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredElders.map((elder) => (
                        <Link
                            key={elder.id}
                            href={`/elders/${elder.id}`}
                            className="glass-card p-5 hover:bg-white/10 transition-all hover:scale-[1.01] group"
                        >
                            <div className="flex items-start justify-between mb-3">
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
                                <svg className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-400">
                                <span>🤖 分析 {elder.session_count} 次</span>
                                {elder.notes && <span className="truncate">📝 {elder.notes}</span>}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
