'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface Instructor {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    organization: string | null
    role: string
    is_active: boolean
    created_at: string
}

export default function AdminPage() {
    const [instructors, setInstructors] = useState<Instructor[]>([])
    const [loading, setLoading] = useState(true)
    const [toggling, setToggling] = useState<string | null>(null)

    const fetchInstructors = async () => {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            toast.error('載入失敗: ' + error.message)
        } else {
            setInstructors(data || [])
        }
        setLoading(false)
    }

    useEffect(() => { fetchInstructors() }, [])

    const toggleActive = async (id: string, currentStatus: boolean) => {
        setToggling(id)
        const supabase = createClient()
        const { error } = await supabase
            .from('profiles')
            .update({ is_active: !currentStatus })
            .eq('id', id)

        if (error) {
            toast.error('更新失敗: ' + error.message)
        } else {
            toast.success(currentStatus ? '已停用該帳號' : '已啟用該帳號')
            fetchInstructors()
        }
        setToggling(null)
    }

    const activeCount = instructors.filter(i => i.is_active).length
    const disabledCount = instructors.filter(i => !i.is_active).length

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">🔑 管理員控制台</h1>
                <p className="text-slate-400 text-sm mt-1">管理指導員帳號權限</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="glass-card p-4 text-center">
                    <p className="text-2xl font-bold text-white">{instructors.length}</p>
                    <p className="text-xs text-slate-400">總帳號數</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
                    <p className="text-xs text-slate-400">啟用中</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-2xl font-bold text-red-400">{disabledCount}</p>
                    <p className="text-xs text-slate-400">已停用</p>
                </div>
            </div>

            {/* Instructor List */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4">指導員列表</h2>

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : instructors.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                        <p className="text-4xl mb-3">👥</p>
                        <p>尚無指導員帳號</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {instructors.map((instructor) => (
                            <div
                                key={instructor.id}
                                className={`flex items-center justify-between p-4 rounded-xl transition-colors ${instructor.is_active ? 'bg-white/5 hover:bg-white/10' : 'bg-red-500/5 border border-red-500/10'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    {instructor.avatar_url ? (
                                        <img src={instructor.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold">
                                            {instructor.full_name?.[0] || '?'}
                                        </div>
                                    )}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-white font-medium">{instructor.full_name}</p>
                                            {instructor.role === 'admin' && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                    管理員
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${instructor.is_active
                                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                }`}>
                                                {instructor.is_active ? '啟用中' : '已停用'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500">{instructor.email}</p>
                                    </div>
                                </div>

                                {/* 不能停用自己（admin），其他人可切換 */}
                                {instructor.role !== 'admin' && (
                                    <button
                                        onClick={() => toggleActive(instructor.id, instructor.is_active)}
                                        disabled={toggling === instructor.id}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${instructor.is_active
                                                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                                            }`}
                                    >
                                        {toggling === instructor.id
                                            ? '處理中...'
                                            : instructor.is_active ? '🚫 停用' : '✅ 啟用'
                                        }
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
