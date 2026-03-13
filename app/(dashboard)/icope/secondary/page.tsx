'use client'

import { createClient } from '@/lib/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useMemo, Suspense } from 'react'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity-log'
import { SECONDARY_THRESHOLDS } from '@/types/icope'
import dynamic from 'next/dynamic'

// 動態載入 AI 測試元件（避免 SSR + 減少初始 bundle）
const ChairStandCamera = dynamic(() => import('@/components/icope/ChairStandCamera'), { ssr: false })
const BalanceCamera = dynamic(() => import('@/components/icope/BalanceCamera'), { ssr: false })

/** 複評任務設定 */
const TASK_CONFIG: Record<string, {
    icon: string
    title: string
    description: string
    hasAiTest?: boolean
    fields: { key: string; type: 'number' | 'text'; label: string; hint?: string; min?: number; max?: number }[]
}> = {
    'AD8': {
        icon: '🧠',
        title: 'AD8 認知量表',
        description: '詢問長者或知情人以下 8 個問題，每項回答「是」得 1 分。',
        fields: [
            { key: 'ad8_score', type: 'number', label: 'AD8 總分', hint: '0-8 分，≥2 分為異常', min: 0, max: 8 },
        ],
    },
    'SPPB': {
        icon: '🦿',
        title: 'SPPB 行動量表',
        description: '包含平衡測試（3 項）、步行速度測試、椅子起立測試，各項 0-4 分。',
        hasAiTest: true,
        fields: [
            { key: 'sppb_score', type: 'number', label: 'SPPB 總分', hint: '0-12 分，≤8 分為異常', min: 0, max: 12 },
        ],
    },
    'MNA-SF': {
        icon: '🍎',
        title: 'MNA-SF 營養量表',
        description: '迷你營養評估簡易版，包含食慾、體重變化、活動力、壓力、BMI 等項目。',
        fields: [
            { key: 'mna_sf_score', type: 'number', label: 'MNA-SF 總分', hint: '0-14 分，≤11 分為異常', min: 0, max: 14 },
        ],
    },
    'GDS-15': {
        icon: '💭',
        title: 'GDS-15 憂鬱量表',
        description: '老年憂鬱量表簡版，包含 15 個是/否問題。',
        fields: [
            { key: 'gds15_score', type: 'number', label: 'GDS-15 總分', hint: '0-15 分，≥5 分為異常', min: 0, max: 15 },
        ],
    },
    'Meds': {
        icon: '💊',
        title: '用藥評估',
        description: '評估長者目前使用藥物種類、數量、是否有多重用藥或不當用藥情形。',
        fields: [
            { key: 'medication_result', type: 'text', label: '用藥評估結果' },
        ],
    },
    'Social': {
        icon: '🤝',
        title: '社會照護與支持評估',
        description: '評估長者社交參與、照護支持系統、生活環境等面向。',
        fields: [
            { key: 'social_care_result', type: 'text', label: '社會照護評估結果' },
        ],
    },
}

function SecondaryContent() {
    const searchParams = useSearchParams()
    const router = useRouter()

    const assessmentId = searchParams.get('assessment_id') || ''
    const tasksParam = searchParams.get('tasks') || ''
    const patientName = searchParams.get('patient_name') || '未知'

    const tasks = useMemo(() => tasksParam.split(',').filter(Boolean), [tasksParam])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [formData, setFormData] = useState<Record<string, string | number | null>>({})
    const [saving, setSaving] = useState(false)
    // AI 測試模式
    const [aiTestMode, setAiTestMode] = useState<'none' | 'chair_stand' | 'balance'>('none')

    const currentTask = tasks[currentIndex]
    const config = currentTask ? TASK_CONFIG[currentTask] : null
    const isLast = currentIndex === tasks.length - 1

    if (!assessmentId || tasks.length === 0) {
        return (
            <div className="text-center py-16 text-slate-500">
                <p className="text-5xl mb-3">❌</p>
                <p>缺少評估資訊</p>
                <button onClick={() => router.push('/icope')} className="mt-4 text-primary-400 text-sm hover:underline">
                    返回評估列表
                </button>
            </div>
        )
    }

    /** 進入下一個任務或儲存全部 */
    const handleNext = async () => {
        if (!isLast) {
            setCurrentIndex(currentIndex + 1)
            return
        }

        setSaving(true)
        try {
            const supabase = createClient()
            const insertData: Record<string, string | number | null> = { assessment_id: assessmentId }

            Object.entries(formData).forEach(([key, val]) => {
                if (val !== '' && val !== null && val !== undefined) {
                    insertData[key] = val
                }
            })

            const { error } = await supabase
                .from('secondary_assessments')
                .insert(insertData)

            if (error) throw new Error(error.message)

            toast.success('複評已完成並儲存！')
            logActivity(
                '完成 ICOPE 複評',
                `長者: ${patientName}, 量表: ${tasks.join(', ')}`,
                'assessment',
                assessmentId
            )
            router.push('/icope')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '儲存失敗'
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }

    if (!config) return null

    // ========================================================================
    // AI 測試全螢幕模式
    // ========================================================================
    if (aiTestMode === 'chair_stand') {
        return (
            <ChairStandCamera
                assessmentId={assessmentId}
                patientName={patientName}
                onClose={() => setAiTestMode('none')}
            />
        )
    }

    if (aiTestMode === 'balance') {
        return (
            <BalanceCamera
                assessmentId={assessmentId}
                patientName={patientName}
                onClose={() => setAiTestMode('none')}
            />
        )
    }

    // ========================================================================
    // 一般表單模式
    // ========================================================================
    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            {/* Header */}
            <div>
                <button onClick={() => router.push('/icope')} className="text-slate-400 hover:text-white transition-colors text-sm mb-2">
                    ← 返回評估列表
                </button>
                <h1 className="text-2xl font-bold text-white">📋 ICOPE 複評</h1>
                <p className="text-sm text-slate-400 mt-1">
                    長者：<span className="text-white font-medium">{patientName}</span>
                </p>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
                {tasks.map((t, i) => {
                    const tc = TASK_CONFIG[t]
                    const isActive = i === currentIndex
                    const isDone = i < currentIndex
                    return (
                        <div key={t} className="flex items-center gap-1.5 flex-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${isActive ? 'bg-primary-600 text-white' :
                                isDone ? 'bg-emerald-500/20 text-emerald-400' :
                                    'bg-white/5 text-slate-600'
                                }`}>
                                {isDone ? '✓' : tc?.icon || '?'}
                            </div>
                            {i < tasks.length - 1 && <div className={`h-0.5 flex-1 rounded ${isDone ? 'bg-emerald-500/30' : 'bg-white/5'}`} />}
                        </div>
                    )
                })}
            </div>

            {/* Current Task */}
            <div className="glass-card p-6 space-y-5">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{config.icon}</span>
                    <div>
                        <h2 className="text-xl font-bold text-white">{config.title}</h2>
                        <p className="text-sm text-slate-400 mt-0.5">{config.description}</p>
                    </div>
                </div>

                {/* SPPB AI 測試按鈕 */}
                {config.hasAiTest && currentTask === 'SPPB' && (
                    <div className="space-y-2">
                        <p className="text-sm text-slate-300 font-medium">📸 AI 視覺測試（使用手機後鏡頭）</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setAiTestMode('chair_stand')}
                                className="p-4 rounded-xl bg-blue-500/10 border-2 border-blue-500/25 hover:border-blue-500/50 hover:bg-blue-500/20 transition-all text-left group"
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-2xl">🪑</span>
                                    <p className="text-white font-bold text-sm group-hover:text-blue-400 transition-colors">椅子起站測試</p>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-tight">
                                    AI 自動計算起立坐下 5 次並計時
                                </p>
                            </button>
                            <button
                                onClick={() => setAiTestMode('balance')}
                                className="p-4 rounded-xl bg-purple-500/10 border-2 border-purple-500/25 hover:border-purple-500/50 hover:bg-purple-500/20 transition-all text-left group"
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-2xl">⚖️</span>
                                    <p className="text-white font-bold text-sm group-hover:text-purple-400 transition-colors">平衡測試</p>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-tight">
                                    三階段闖關：並排→半並排→直線
                                </p>
                            </button>
                        </div>
                        <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-xs text-slate-600">或手動輸入分數</span>
                            <div className="flex-1 h-px bg-white/10" />
                        </div>
                    </div>
                )}

                {/* 欄位輸入 */}
                <div className="space-y-4">
                    {config.fields.map(field => (
                        <div key={field.key}>
                            <label className="block text-sm text-slate-300 mb-1.5 font-medium">
                                {field.label}
                                {field.hint && (
                                    <span className="text-xs text-slate-500 font-normal ml-2">（{field.hint}）</span>
                                )}
                            </label>
                            {field.type === 'number' ? (
                                <input
                                    type="number"
                                    value={formData[field.key] ?? ''}
                                    onChange={e => {
                                        const val = e.target.value === '' ? null : Number(e.target.value)
                                        setFormData(prev => ({ ...prev, [field.key]: val }))
                                    }}
                                    min={field.min}
                                    max={field.max}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg focus:border-primary-500 focus:outline-none"
                                    placeholder="輸入分數"
                                />
                            ) : (
                                <textarea
                                    value={(formData[field.key] as string) || ''}
                                    onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-base focus:border-primary-500 focus:outline-none resize-none"
                                    rows={3}
                                    placeholder="輸入評估結果..."
                                />
                            )}

                            {/* 分數即時判定 */}
                            {field.type === 'number' && formData[field.key] != null && SECONDARY_THRESHOLDS[field.key] && (
                                <div className="mt-2">
                                    {(() => {
                                        const threshold = SECONDARY_THRESHOLDS[field.key]
                                        const val = formData[field.key] as number
                                        const isAbnormal = threshold.operator === '>='
                                            ? val >= threshold.value
                                            : val <= threshold.value
                                        return (
                                            <span className={`text-sm font-medium ${isAbnormal ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {isAbnormal ? `⚠️ 異常（${threshold.label}）` : '✓ 正常範圍'}
                                            </span>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
                <button
                    onClick={() => currentIndex > 0 ? setCurrentIndex(currentIndex - 1) : router.back()}
                    className="flex-1 py-3.5 rounded-xl bg-white/5 text-slate-400 text-base font-medium hover:bg-white/10 transition-colors"
                >
                    ← 上一步
                </button>
                <button
                    onClick={handleNext}
                    disabled={saving}
                    className="flex-1 btn-accent text-base py-3.5 disabled:opacity-50"
                >
                    {saving ? '儲存中...' : isLast ? '✓ 完成複評' : `下一項：${TASK_CONFIG[tasks[currentIndex + 1]]?.title || ''} →`}
                </button>
            </div>
        </div>
    )
}

export default function SecondaryAssessmentPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <SecondaryContent />
        </Suspense>
    )
}
