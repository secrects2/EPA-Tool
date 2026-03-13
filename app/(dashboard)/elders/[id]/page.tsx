'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity-log'
import AnalysisReport from '@/components/analysis/AnalysisReport'
import { type AnalysisMetrics } from '@/lib/analysis/ai-prescription'

interface Elder {
    id: string
    name: string
    gender: string | null
    birth_date: string | null
    notes: string | null
}

interface Session {
    id: string
    test_type: string
    avg_elbow_rom: number | null
    avg_shoulder_rom: number | null
    avg_trunk_tilt: number | null
    avg_core_stability: number | null
    avg_shoulder_velocity: number | null
    avg_elbow_velocity: number | null
    avg_wrist_velocity: number | null
    tremor_detected: boolean
    compensation_detected: boolean
    duration_seconds: number | null
    notes: string | null
    created_at: string
}

export default function ElderDetailPage() {
    const params = useParams()
    const router = useRouter()
    const elderId = params.id as string
    const [elder, setElder] = useState<Elder | null>(null)
    const [sessions, setSessions] = useState<Session[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedSession, setExpandedSession] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)
    const [reportSession, setReportSession] = useState<Session | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            const supabase = createClient()

            const { data: elderData } = await supabase
                .from('elders')
                .select('*')
                .eq('id', elderId)
                .single()

            if (elderData) setElder(elderData)

            const { data: sessionData } = await supabase
                .from('analysis_sessions')
                .select('*')
                .eq('elder_id', elderId)
                .order('created_at', { ascending: false })

            if (sessionData) setSessions(sessionData)
            setLoading(false)
        }

        fetchData()
    }, [elderId])

    const handleExportExcel = async () => {
        setExporting(true)
        try {
            const res = await fetch(`/api/export/${elderId}`)
            if (!res.ok) throw new Error('匯出失敗')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${elder?.name || '長輩'}_前後測報告.xlsx`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Excel 匯出成功！')
            logActivity('匯出 Excel', `長輩: ${elder?.name}`, 'elder', elderId)
        } catch (err) {
            toast.error('匯出失敗，請重試')
        }
        setExporting(false)
    }

    const handleDeleteElder = async () => {
        if (!confirm(`確定要刪除「${elder?.name}」的所有資料嗎？此操作不可恢復。`)) return
        const supabase = createClient()
        const { error } = await supabase.from('elders').delete().eq('id', elderId)
        if (error) {
            toast.error('刪除失敗')
        } else {
            toast.success('已刪除')
            logActivity('刪除長輩', `姓名: ${elder?.name}`, 'elder', elderId)
            router.push('/elders')
        }
    }

    const preSessions = sessions.filter(s => s.test_type === 'pre')
    const postSessions = sessions.filter(s => s.test_type === 'post')
    const latestPre = preSessions[0]
    const latestPost = postSessions[0]

    const renderComparison = (label: string, preVal: number | null, postVal: number | null, unit: string = '°', lowerBetter: boolean = false) => {
        const pre = preVal ?? null
        const post = postVal ?? null
        if (pre === null && post === null) return null

        const diff = pre !== null && post !== null ? post - pre : null
        const isImproved = diff !== null ? (lowerBetter ? diff < 0 : diff > 0) : null

        return (
            <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
                <span className="text-sm text-slate-400">{label}</span>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-500">{pre !== null ? `${pre.toFixed(1)}${unit}` : '--'}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-white font-medium">{post !== null ? `${post.toFixed(1)}${unit}` : '--'}</span>
                    {diff !== null && (
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${isImproved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}{unit}
                        </span>
                    )}
                </div>
            </div>
        )
    }

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
    }

    if (!elder) {
        return <div className="text-center py-20 text-slate-400">找不到此長輩資料</div>
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/elders')} className="text-slate-400 hover:text-white transition-colors">
                        ← 返回
                    </button>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white ${elder.gender === 'female' ? 'bg-pink-600/60' : 'bg-blue-600/60'}`}>
                        {elder.name[0]}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{elder.name}</h1>
                        <p className="text-sm text-slate-400">
                            {elder.gender === 'female' ? '女' : '男'}
                            {elder.birth_date && ` · ${elder.birth_date}`}
                            {elder.notes && ` · ${elder.notes}`}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/analysis/${elderId}`} className="btn-accent text-sm">
                        🤖 開始分析
                    </Link>
                    <button onClick={handleExportExcel} disabled={exporting} className="btn-primary text-sm disabled:opacity-50">
                        {exporting ? '匯出中...' : '📥 匯出 Excel'}
                    </button>
                    <button onClick={handleDeleteElder} className="px-4 py-2.5 rounded-xl text-sm text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors">
                        🗑 刪除
                    </button>
                </div>
            </div>

            {/* Pre-Post Comparison */}
            {(latestPre || latestPost) && (
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">📊 前後測對比</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <p className="text-xs text-amber-400 font-medium mb-1">最新前測</p>
                            <p className="text-sm text-white">{latestPre ? new Date(latestPre.created_at).toLocaleDateString('zh-TW') : '尚未進行'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-xs text-emerald-400 font-medium mb-1">最新後測</p>
                            <p className="text-sm text-white">{latestPost ? new Date(latestPost.created_at).toLocaleDateString('zh-TW') : '尚未進行'}</p>
                        </div>
                    </div>
                    <div className="space-y-0">
                        {renderComparison('肘關節活動度 (ROM)', latestPre?.avg_elbow_rom ?? null, latestPost?.avg_elbow_rom ?? null)}
                        {renderComparison('肩關節活動度', latestPre?.avg_shoulder_rom ?? null, latestPost?.avg_shoulder_rom ?? null)}
                        {renderComparison('軀幹傾斜度', latestPre?.avg_trunk_tilt ?? null, latestPost?.avg_trunk_tilt ?? null, '°', true)}
                        {renderComparison('核心穩定性', latestPre?.avg_core_stability ?? null, latestPost?.avg_core_stability ?? null, '°', true)}
                        {renderComparison('肩部角速度', latestPre?.avg_shoulder_velocity ?? null, latestPost?.avg_shoulder_velocity ?? null, '°/s')}
                        {renderComparison('肘部角速度', latestPre?.avg_elbow_velocity ?? null, latestPost?.avg_elbow_velocity ?? null, '°/s')}
                        {renderComparison('腕部角速度', latestPre?.avg_wrist_velocity ?? null, latestPost?.avg_wrist_velocity ?? null, '°/s')}
                    </div>
                </div>
            )}

            {/* Session History */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4">📋 分析紀錄 ({sessions.length})</h2>
                {sessions.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-4xl mb-3">📭</p>
                        <p className="text-slate-400">尚無分析紀錄</p>
                        <Link href={`/analysis/${elderId}`} className="inline-block mt-3 btn-accent text-sm">
                            開始第一次分析
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sessions.map((session) => (
                            <div key={session.id} className="rounded-xl bg-white/5 overflow-hidden">
                                <button
                                    onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${session.test_type === 'pre' ? 'bg-amber-500/20 text-amber-400' :
                                            session.test_type === 'post' ? 'bg-emerald-500/20 text-emerald-400' :
                                                'bg-slate-500/20 text-slate-400'
                                            }`}>
                                            {session.test_type === 'pre' ? '前測' : session.test_type === 'post' ? '後測' : '練習'}
                                        </span>
                                        <span className="text-white text-sm">{new Date(session.created_at).toLocaleString('zh-TW')}</span>
                                        {session.duration_seconds && (
                                            <span className="text-xs text-slate-500">{Math.round(session.duration_seconds)}秒</span>
                                        )}
                                    </div>
                                    <span className="text-slate-500">{expandedSession === session.id ? '▲' : '▼'}</span>
                                </button>
                                {expandedSession === session.id && (
                                    <div className="px-4 pb-4 space-y-3">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                            <div className="p-2 rounded-lg bg-white/5">
                                                <p className="text-xs text-slate-500">肘ROM</p>
                                                <p className="text-white font-medium">{session.avg_elbow_rom?.toFixed(1) ?? '--'}°</p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/5">
                                                <p className="text-xs text-slate-500">肩ROM</p>
                                                <p className="text-white font-medium">{session.avg_shoulder_rom?.toFixed(1) ?? '--'}°</p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/5">
                                                <p className="text-xs text-slate-500">核心穩定性</p>
                                                <p className="text-white font-medium">{session.avg_core_stability?.toFixed(1) ?? '--'}°</p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/5">
                                                <p className="text-xs text-slate-500">軀幹傾斜</p>
                                                <p className="text-white font-medium">{session.avg_trunk_tilt?.toFixed(1) ?? '--'}°</p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/5">
                                                <p className="text-xs text-slate-500">震顫</p>
                                                <p className={`font-medium ${session.tremor_detected ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                    {session.tremor_detected ? '檢測到' : '未檢測到'}
                                                </p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/5">
                                                <p className="text-xs text-slate-500">代償動作</p>
                                                <p className={`font-medium ${session.compensation_detected ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                    {session.compensation_detected ? '檢測到' : '未檢測到'}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setReportSession(session)}
                                            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-cyan-600 text-white font-bold text-sm hover:opacity-90 transition-opacity"
                                        >
                                            📊 查看完整 AI 分析報告
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* Full Report Overlay */}
            {reportSession && (
                <AnalysisReport
                    metrics={{
                        elbow_rom: reportSession.avg_elbow_rom ?? 0,
                        trunk_stability: reportSession.avg_trunk_tilt ?? 0,
                        avg_velocity: reportSession.avg_wrist_velocity ?? 0,
                        max_rom: reportSession.avg_elbow_rom ?? 0,
                        min_rom: reportSession.avg_elbow_rom ?? 0,
                        avg_rom: reportSession.avg_elbow_rom ?? 0,
                        avg_trunk_tilt: reportSession.avg_trunk_tilt ?? 0,
                        throw_count: 0,
                        stable_ratio: reportSession.avg_trunk_tilt != null ? Math.max(0, Math.round(100 - reportSession.avg_trunk_tilt * 3)) : 50,
                        core_stability_angle: reportSession.avg_core_stability ?? null,
                        avg_shoulder_angular_vel: reportSession.avg_shoulder_velocity ?? null,
                        avg_elbow_angular_vel: reportSession.avg_elbow_velocity ?? null,
                        avg_wrist_angular_vel: reportSession.avg_wrist_velocity ?? null,
                        tremor_detected_ratio: reportSession.tremor_detected ? 25 : 0,
                        tremor_avg_frequency: null,
                        compensation_detected_ratio: reportSession.compensation_detected ? 30 : 0,
                        compensation_types: reportSession.compensation_detected ? ['動作代償'] : [],
                        posture_correction_avg: 0,
                        manual_throw_count: 0,
                    } as AnalysisMetrics}
                    patientName={elder?.name}
                    sessionDate={new Date(reportSession.created_at).toLocaleString('zh-TW')}
                    durationSeconds={reportSession.duration_seconds ?? undefined}
                    onClose={() => setReportSession(null)}
                />
            )}
        </div>
    )
}
