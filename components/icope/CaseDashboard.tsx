'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
    getFollowUpStatus,
    getPostTestStatus,
    getPostTestTasks,
    countAbnormalDomains,
    type PrimaryDomainKey,
} from '@/lib/icope/case-tracking'
import { PRIMARY_DOMAIN_LABELS, type PrimaryDomain } from '@/types/icope'

// ============================================================================
// 型別
// ============================================================================

interface CaseRow {
    id: string
    patient_id: string
    instructor_id: string
    stage: string
    assessed_at: string
    follow_up_completed: boolean
    post_test_completed: boolean
    notes: string | null
    patients: {
        name: string
        id_number: string
        gender: string
        birth_date: string
    } | null
    primary_assessments: {
        cognition: boolean
        mobility: boolean
        nutrition: boolean
        vision: boolean
        hearing: boolean
        depression: boolean
    } | null
}

// ============================================================================
// Component
// ============================================================================

export default function CaseDashboard() {
    const [cases, setCases] = useState<CaseRow[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'overdue' | 'available'>('all')
    const router = useRouter()

    useEffect(() => {
        const fetchCases = async () => {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('assessments')
                .select(`
          *,
          patients(name, id_number, gender, birth_date),
          primary_assessments(cognition, mobility, nutrition, vision, hearing, depression)
        `)
                .eq('stage', 'initial')
                .order('assessed_at', { ascending: false })

            if (error) {
                toast.error('載入失敗: ' + error.message)
            } else {
                setCases((data as CaseRow[]) || [])
            }
            setLoading(false)
        }
        fetchCases()
    }, [])

    /** 標記追蹤完成 */
    const markFollowUp = async (assessmentId: string) => {
        const supabase = createClient()
        const { error } = await supabase
            .from('assessments')
            .update({ follow_up_completed: true })
            .eq('id', assessmentId)

        if (error) {
            toast.error('更新失敗: ' + error.message)
        } else {
            setCases(prev => prev.map(c => c.id === assessmentId ? { ...c, follow_up_completed: true } : c))
            toast.success('已標記追蹤完成')
        }
    }

    /** 過濾後的資料 */
    const filteredCases = cases.filter(c => {
        if (filter === 'all') return true
        const followUp = getFollowUpStatus(c.assessed_at, c.follow_up_completed)
        const postTest = getPostTestStatus(c.assessed_at, c.post_test_completed)
        if (filter === 'overdue') return followUp.status === 'overdue' || postTest.status === 'overdue'
        if (filter === 'available') return postTest.status === 'available'
        return true
    })

    /** 統計 */
    const stats = {
        total: cases.length,
        followUpOverdue: cases.filter(c => getFollowUpStatus(c.assessed_at, c.follow_up_completed).status === 'overdue').length,
        postTestAvailable: cases.filter(c => getPostTestStatus(c.assessed_at, c.post_test_completed).status === 'available').length,
        completed: cases.filter(c => c.post_test_completed).length,
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">📊 個案管理儀表板</h1>
                <p className="text-slate-400 text-sm mt-1">追蹤與後測進度管控</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button onClick={() => setFilter('all')} className={`glass-card p-4 text-center transition-all ${filter === 'all' ? 'ring-2 ring-primary-500/50' : ''}`}>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                    <p className="text-xs text-slate-400">總個案</p>
                </button>
                <button onClick={() => setFilter('overdue')} className={`glass-card p-4 text-center transition-all ${filter === 'overdue' ? 'ring-2 ring-red-500/50' : ''}`}>
                    <p className="text-2xl font-bold text-red-400">{stats.followUpOverdue}</p>
                    <p className="text-xs text-slate-400">逾期未追蹤</p>
                </button>
                <button onClick={() => setFilter('available')} className={`glass-card p-4 text-center transition-all ${filter === 'available' ? 'ring-2 ring-amber-500/50' : ''}`}>
                    <p className="text-2xl font-bold text-amber-400">{stats.postTestAvailable}</p>
                    <p className="text-xs text-slate-400">可進行後測</p>
                </button>
                <button onClick={() => setFilter('all')} className="glass-card p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
                    <p className="text-xs text-slate-400">後測已完成</p>
                </button>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">姓名</th>
                                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">身分證字號</th>
                                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">初評日期</th>
                                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">異常項目</th>
                                <th className="text-center text-xs text-slate-500 font-medium px-5 py-3">追蹤狀態</th>
                                <th className="text-center text-xs text-slate-500 font-medium px-5 py-3">後測狀態</th>
                                <th className="text-center text-xs text-slate-500 font-medium px-5 py-3">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b border-white/5">
                                        {Array.from({ length: 7 }).map((_, j) => (
                                            <td key={j} className="px-5 py-4">
                                                <div className="h-4 bg-white/5 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filteredCases.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-slate-500">
                                        {filter !== 'all' ? '此篩選條件下無個案' : '尚無評估紀錄'}
                                    </td>
                                </tr>
                            ) : (
                                filteredCases.map(c => {
                                    const followUp = getFollowUpStatus(c.assessed_at, c.follow_up_completed)
                                    const postTest = getPostTestStatus(c.assessed_at, c.post_test_completed)
                                    const primary = c.primary_assessments
                                    const abnormal = primary ? countAbnormalDomains(primary) : 0
                                    const abnormalDomains = primary
                                        ? (['cognition', 'mobility', 'nutrition', 'vision', 'hearing', 'depression'] as PrimaryDomain[]).filter(d => primary[d])
                                        : []

                                    return (
                                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                            <td className="px-5 py-4">
                                                <p className="text-white font-medium text-sm">{c.patients?.name || '—'}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-slate-400 text-sm font-mono">{c.patients?.id_number || '—'}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-slate-400 text-sm">
                                                    {new Date(c.assessed_at).toLocaleDateString('zh-TW')}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {abnormalDomains.length === 0 ? (
                                                        <span className="text-xs text-emerald-400/60">全部正常</span>
                                                    ) : (
                                                        abnormalDomains.map(d => (
                                                            <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">
                                                                {PRIMARY_DOMAIN_LABELS[d]}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span>{followUp.icon}</span>
                                                    <span className={`text-xs font-medium ${followUp.color}`}>{followUp.label}</span>
                                                </div>
                                                {followUp.status === 'overdue' && (
                                                    <button
                                                        onClick={() => markFollowUp(c.id)}
                                                        className="mt-1 text-[10px] text-primary-400 hover:underline"
                                                    >
                                                        標記已完成
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span>{postTest.icon}</span>
                                                    <span className={`text-xs font-medium ${postTest.color}`}>{postTest.label}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                {postTest.canStart && abnormalDomains.length > 0 ? (
                                                    <button
                                                        onClick={() => {
                                                            const tasks = getPostTestTasks(primary as Record<PrimaryDomainKey, boolean>)
                                                            const params = new URLSearchParams({
                                                                assessment_id: c.id,
                                                                tasks: tasks.join(','),
                                                                patient_name: c.patients?.name || '',
                                                            })
                                                            router.push(`/icope/secondary?${params.toString()}`)
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                                                    >
                                                        進行後測
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-slate-600">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-white/5">
                    {loading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="p-4">
                                <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
                            </div>
                        ))
                    ) : filteredCases.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 text-sm">
                            {filter !== 'all' ? '此篩選條件下無個案' : '尚無評估紀錄'}
                        </div>
                    ) : (
                        filteredCases.map(c => {
                            const followUp = getFollowUpStatus(c.assessed_at, c.follow_up_completed)
                            const postTest = getPostTestStatus(c.assessed_at, c.post_test_completed)
                            const primary = c.primary_assessments
                            const abnormalDomains = primary
                                ? (['cognition', 'mobility', 'nutrition', 'vision', 'hearing', 'depression'] as PrimaryDomain[]).filter(d => primary[d])
                                : []

                            return (
                                <div key={c.id} className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-white font-medium">{c.patients?.name || '—'}</p>
                                            <p className="text-xs text-slate-500 font-mono">{c.patients?.id_number}</p>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {new Date(c.assessed_at).toLocaleDateString('zh-TW')}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {abnormalDomains.map(d => (
                                            <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400">
                                                {PRIMARY_DOMAIN_LABELS[d]}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <span>{followUp.icon}</span>
                                            <span className={`text-xs ${followUp.color}`}>{followUp.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span>{postTest.icon}</span>
                                            <span className={`text-xs ${postTest.color}`}>{postTest.label}</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {followUp.status === 'overdue' && (
                                            <button
                                                onClick={() => markFollowUp(c.id)}
                                                className="flex-1 py-2 rounded-lg bg-white/5 text-xs text-slate-400 hover:bg-white/10"
                                            >
                                                ✓ 標記已追蹤
                                            </button>
                                        )}
                                        {postTest.canStart && abnormalDomains.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    const tasks = getPostTestTasks(primary as Record<PrimaryDomainKey, boolean>)
                                                    const params = new URLSearchParams({
                                                        assessment_id: c.id,
                                                        tasks: tasks.join(','),
                                                        patient_name: c.patients?.name || '',
                                                    })
                                                    router.push(`/icope/secondary?${params.toString()}`)
                                                }}
                                                className="flex-1 py-2 rounded-lg bg-amber-500/20 text-xs text-amber-400 font-medium"
                                            >
                                                進行後測 →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
