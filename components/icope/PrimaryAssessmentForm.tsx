'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity-log'
import dynamic from 'next/dynamic'

// 動態載入 AI 相機元件
const ChairStandCamera = dynamic(() => import('@/components/icope/ChairStandCamera'), { ssr: false })

// ============================================================================
// Zod Schema — 初評 6 大面向
// ============================================================================

const primaryAssessmentSchema = z.object({
    /** 認知功能 — 記憶 3 物品與定向力 */
    cognition: z.boolean(),
    /** 行動能力 — 起立坐下 5 次是否大於 12 秒 */
    mobility: z.boolean(),
    /** 營養狀態 — 體重減輕與食慾不振 */
    nutrition: z.boolean(),
    /** 視力 — 簡單視力圖與高風險調查 */
    vision: z.boolean(),
    /** 聽力 — 氣音測試 */
    hearing: z.boolean(),
    /** 憂鬱 — 過去兩週情緒 */
    depression: z.boolean(),
})

type PrimaryAssessmentValues = z.infer<typeof primaryAssessmentSchema>

// ============================================================================
// 複評任務類型
// ============================================================================

type SecondaryTask = 'AD8' | 'SPPB' | 'MNA-SF' | 'GDS-15' | 'Meds' | 'Social'

const TASK_LABELS: Record<SecondaryTask, string> = {
    'AD8': 'AD8 認知量表',
    'SPPB': 'SPPB 行動量表',
    'MNA-SF': 'MNA-SF 營養量表',
    'GDS-15': 'GDS-15 憂鬱量表',
    'Meds': '用藥評估',
    'Social': '社會照護與支持評估',
}

const TASK_ICONS: Record<SecondaryTask, string> = {
    'AD8': '🧠',
    'SPPB': '🦿',
    'MNA-SF': '🍎',
    'GDS-15': '💭',
    'Meds': '💊',
    'Social': '🤝',
}

// ============================================================================
// 面向 UI 設定
// ============================================================================

interface DomainConfig {
    key: keyof PrimaryAssessmentValues
    icon: string
    title: string
    subtitle: string
    description: string
    criteria: string[]
    abnormalLabel: string
    normalLabel: string
}

const DOMAINS: DomainConfig[] = [
    {
        key: 'cognition',
        icon: '🧠',
        title: '認知功能',
        subtitle: '記憶 3 物品與定向力',
        description: '請長者記住 3 個物品名稱（如：樹、車、紅色），接著進行定向力測試（現在幾年？幾月？星期幾？），最後請長者回憶剛才記住的 3 個物品。',
        criteria: [
            '無法正確回答年/月/星期',
            '無法回憶 3 個物品中的 1 個或以上',
        ],
        abnormalLabel: '異常 — 無法正確回答',
        normalLabel: '正常 — 可正確回答',
    },
    {
        key: 'mobility',
        icon: '🦿',
        title: '行動能力',
        subtitle: '起立坐下 5 次計時',
        description: '請長者雙手交叉於胸前，從椅子上起立坐下 5 次，計算所需時間。椅高約 46 公分，不可使用扶手。',
        criteria: [
            '完成 5 次起立坐下時間 > 12 秒',
            '無法獨立完成測試',
        ],
        abnormalLabel: '異常 — 超過 12 秒或無法完成',
        normalLabel: '正常 — 12 秒內完成',
    },
    {
        key: 'nutrition',
        icon: '🍎',
        title: '營養狀態',
        subtitle: '體重減輕與食慾不振',
        description: '詢問長者近 3 個月內是否有非自主性體重減輕（≥3 公斤），或是否有持續性食慾不振情形。',
        criteria: [
            '近 3 個月非自主體重減輕 ≥ 3 公斤',
            '持續食慾不振',
        ],
        abnormalLabel: '異常 — 有體重減輕或食慾不振',
        normalLabel: '正常 — 無異常',
    },
    {
        key: 'vision',
        icon: '👁️',
        title: '視力',
        subtitle: '簡單視力圖與高風險調查',
        description: '使用簡易視力表檢測雙眼視力，並詢問是否有視力模糊、閱讀困難等問題。同時調查高風險因子（如糖尿病視網膜病變）。',
        criteria: [
            '視力未矯正達 0.5 以下',
            '閱讀書報有困難',
            '高風險因子（糖尿病等）',
        ],
        abnormalLabel: '異常 — 視力受損或有高風險因子',
        normalLabel: '正常 — 視力良好',
    },
    {
        key: 'hearing',
        icon: '👂',
        title: '聽力',
        subtitle: '氣音測試（Whisper Test）',
        description: '站在長者背後約 30 公分處，遮住長者一隻耳朵，以氣音唸出 6 組數字字母組合（如 5-B-6），請長者複誦。兩耳分別測試。',
        criteria: [
            '無法正確複誦 3 組或以上',
            '任一耳測試失敗',
        ],
        abnormalLabel: '異常 — 無法正確複誦',
        normalLabel: '正常 — 可正確複誦',
    },
    {
        key: 'depression',
        icon: '💭',
        title: '憂鬱',
        subtitle: '過去兩週情緒評估',
        description: '詢問長者過去兩週內是否經常感到：(1) 做事情缺乏興趣或樂趣？(2) 感到心情低落、沮喪或絕望？',
        criteria: [
            '過去兩週經常感到缺乏興趣或樂趣',
            '過去兩週經常感到心情低落、沮喪或絕望',
        ],
        abnormalLabel: '異常 — 有情緒困擾',
        normalLabel: '正常 — 情緒穩定',
    },
]

// ============================================================================
// Props
// ============================================================================

interface PrimaryAssessmentFormProps {
    /** 長者 ID */
    patientId: string
    /** 長者姓名（用於顯示） */
    patientName: string
    /** 評估階段 */
    stage: 'initial' | 'post'
}

// ============================================================================
// Component
// ============================================================================

export default function PrimaryAssessmentForm({
    patientId,
    patientName,
    stage,
}: PrimaryAssessmentFormProps) {
    const router = useRouter()
    const [submitting, setSubmitting] = useState(false)
    const [aiCameraOpen, setAiCameraOpen] = useState(false)
    const [aiMobilityResult, setAiMobilityResult] = useState<{ time: number; score: number } | null>(null)

    const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<PrimaryAssessmentValues>({
        resolver: zodResolver(primaryAssessmentSchema),
        defaultValues: {
            cognition: false,
            mobility: false,
            nutrition: false,
            vision: false,
            hearing: false,
            depression: false,
        },
    })

    // 監聽所有面向的值，動態產生複評任務清單
    const watchedValues = useWatch({ control })

    /** 動態產生複評任務清單 */
    const secondaryTasks = useMemo<SecondaryTask[]>(() => {
        const tasks: SecondaryTask[] = []

        if (watchedValues.cognition) tasks.push('AD8')
        if (watchedValues.mobility) tasks.push('SPPB')
        if (watchedValues.nutrition) tasks.push('MNA-SF')
        if (watchedValues.depression) tasks.push('GDS-15')

        // 若任一項異常 → 強制新增用藥與社會照護
        if (tasks.length > 0) {
            tasks.push('Meds', 'Social')
        }

        return tasks
    }, [watchedValues])

    /** 表單送出 */
    const onSubmit = async (data: PrimaryAssessmentValues) => {
        setSubmitting(true)

        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('尚未登入，請重新登入')
                router.push('/login')
                return
            }

            // Step 1：寫入 assessments 表
            const { data: assessment, error: assessmentErr } = await supabase
                .from('assessments')
                .insert({
                    patient_id: patientId,
                    instructor_id: user.id,
                    stage,
                })
                .select('id')
                .single()

            if (assessmentErr || !assessment) {
                throw new Error(assessmentErr?.message || '建立評估失敗')
            }

            // Step 2：寫入 primary_assessments 表
            const { error: primaryErr } = await supabase
                .from('primary_assessments')
                .insert({
                    assessment_id: assessment.id,
                    cognition: data.cognition,
                    mobility: data.mobility,
                    nutrition: data.nutrition,
                    vision: data.vision,
                    hearing: data.hearing,
                    depression: data.depression,
                })

            if (primaryErr) {
                throw new Error(primaryErr.message || '儲存初評失敗')
            }

            // 記錄操作
            const abnormalCount = Object.values(data).filter(Boolean).length
            logActivity(
                '完成 ICOPE 初評',
                `長者: ${patientName}, 異常: ${abnormalCount} 項, 複評任務: ${secondaryTasks.join(', ') || '無'}`,
                'assessment',
                assessment.id
            )

            toast.success('初評已儲存！')

            // Step 3：路由跳轉
            if (secondaryTasks.length > 0) {
                // 將任務清單與 assessment_id 透過 URL params 傳遞
                const params = new URLSearchParams({
                    assessment_id: assessment.id,
                    tasks: secondaryTasks.join(','),
                    patient_name: patientName,
                })
                router.push(`/icope/secondary?${params.toString()}`)
            } else {
                // 無異常項，直接返回評估列表
                toast.success('所有面向皆正常，無需複評')
                router.push('/icope')
            }

        } catch (err: any) {
            toast.error(err.message || '儲存失敗，請重試')
        } finally {
            setSubmitting(false)
        }
    }

    // AI 測試全螢幕模式
    if (aiCameraOpen) {
        return (
            <ChairStandCamera
                assessmentId="primary-preview"
                patientName={patientName}
                onClose={() => setAiCameraOpen(false)}
            />
        )
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Header */}
            <div className="glass-card p-5">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl">📝</div>
                    <div>
                        <h2 className="text-xl font-bold text-white">ICOPE 初評</h2>
                        <p className="text-sm text-slate-400">
                            長者：<span className="text-white font-medium">{patientName}</span>
                            <span className="mx-2 text-slate-600">·</span>
                            {stage === 'initial' ? '初評' : '後測'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 6 大面向 */}
            {DOMAINS.map((domain) => {
                const isAbnormal = watchedValues[domain.key]

                return (
                    <div
                        key={domain.key}
                        className={`glass-card p-5 transition-all duration-300 ${isAbnormal
                            ? 'ring-2 ring-red-500/40 bg-red-500/5'
                            : ''
                            }`}
                    >
                        {/* 面向標題 */}
                        <div className="flex items-start gap-4 mb-4">
                            <span className="text-3xl">{domain.icon}</span>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-white">{domain.title}</h3>
                                <p className="text-sm text-slate-400">{domain.subtitle}</p>
                            </div>
                            {/* 狀態徽章 */}
                            <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${isAbnormal
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                {isAbnormal ? '⚠️ 異常' : '✓ 正常'}
                            </span>
                        </div>

                        {/* 操作說明 */}
                        <div className="bg-white/5 rounded-xl p-4 mb-4">
                            <p className="text-sm text-slate-300 leading-relaxed">{domain.description}</p>
                        </div>

                        {/* 異常判定標準 */}
                        <div className="mb-4">
                            <p className="text-xs text-slate-500 font-medium mb-2">異常判定標準：</p>
                            <ul className="space-y-1">
                                {domain.criteria.map((c, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                                        <span className="text-red-400/60 mt-0.5">•</span>
                                        {c}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* AI 測試入口（僅 mobility） */}
                        {domain.key === 'mobility' && (
                            <div className="mb-4">
                                <button
                                    type="button"
                                    onClick={() => setAiCameraOpen(true)}
                                    className="w-full p-4 rounded-xl bg-blue-500/10 border-2 border-blue-500/25 hover:border-blue-500/50 hover:bg-blue-500/20 transition-all text-left group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl">📸</span>
                                        <div className="flex-1">
                                            <p className="text-white font-bold group-hover:text-blue-400 transition-colors">AI 視覺測試 — 椅子起站</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                使用手機後鏡頭自動計算起立坐下 5 次並計時
                                            </p>
                                        </div>
                                        <span className="text-slate-600 group-hover:text-blue-400 transition-colors">→</span>
                                    </div>
                                </button>
                                {aiMobilityResult && (
                                    <div className="mt-2 flex items-center gap-2 text-sm">
                                        <span className={aiMobilityResult.time > 12 ? 'text-red-400' : 'text-emerald-400'}>
                                            {aiMobilityResult.time > 12 ? '⚠️' : '✓'} AI 測試結果：{aiMobilityResult.time}秒（{aiMobilityResult.score}分）
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 判定按鈕 */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setValue(domain.key, false)}
                                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all ${!isAbnormal
                                    ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                                    : 'bg-white/5 text-slate-500 border-2 border-transparent hover:bg-white/10'
                                    }`}
                            >
                                ✓ {domain.normalLabel}
                            </button>
                            <button
                                type="button"
                                onClick={() => setValue(domain.key, true)}
                                className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-all ${isAbnormal
                                    ? 'bg-red-500/20 text-red-400 border-2 border-red-500/40 shadow-lg shadow-red-500/10'
                                    : 'bg-white/5 text-slate-500 border-2 border-transparent hover:bg-white/10'
                                    }`}
                            >
                                ⚠️ {domain.abnormalLabel}
                            </button>
                        </div>

                        {/* 隱藏的 checkbox 供 react-hook-form 管理 */}
                        <input type="hidden" {...register(domain.key)} />
                    </div>
                )
            })}

            {/* 動態複評任務清單 */}
            {secondaryTasks.length > 0 && (
                <div className="glass-card p-5 ring-2 ring-amber-500/30 bg-amber-500/5">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">📋</span>
                        <div>
                            <h3 className="text-lg font-bold text-amber-400">後續複評任務</h3>
                            <p className="text-xs text-slate-500">以下量表將在初評送出後依序進行</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {secondaryTasks.map((task) => (
                            <div
                                key={task}
                                className="flex items-center gap-2 p-3 rounded-xl bg-white/5"
                            >
                                <span className="text-lg">{TASK_ICONS[task]}</span>
                                <span className="text-sm text-white font-medium">{TASK_LABELS[task]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 送出按鈕 */}
            <div className="flex gap-3 sticky bottom-4">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex-1 py-3.5 rounded-xl bg-white/5 text-slate-400 text-base font-medium hover:bg-white/10 transition-colors"
                >
                    ← 返回
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 btn-accent text-base py-3.5 disabled:opacity-50"
                >
                    {submitting ? '儲存中...' : secondaryTasks.length > 0 ? '送出初評，開始複評 →' : '✓ 送出初評'}
                </button>
            </div>
        </form>
    )
}
