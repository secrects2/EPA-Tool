'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity-log'
import {
    calculateBalanceScore,
    calculateGaitScore,
    calculateChairScore,
    calculateSppbTotal,
    getSppbVerdict,
    type BalanceResult,
} from '@/lib/icope/sppb-scoring'

// ============================================================================
// Zod Schema
// ============================================================================

const sppbSchema = z.object({
    // 平衡測試
    sideBySide: z.boolean(),
    semiTandem: z.boolean(),
    tandemSeconds: z.number().min(0).max(10),
    // 步行測試
    gaitDistance: z.enum(['3', '4']),
    gaitSeconds: z.number().min(0).nullable(),
    gaitUnable: z.boolean(),
    // 椅子起站測試
    chairSeconds: z.number().min(0).nullable(),
    chairUnable: z.boolean(),
})

type SppbFormValues = z.infer<typeof sppbSchema>

// ============================================================================
// Props
// ============================================================================

interface SppbAssessmentFormProps {
    /** 評估 ID */
    assessmentId: string
    /** 長者姓名 */
    patientName?: string
    /** 剩餘複評任務（用於跳轉） */
    remainingTasks?: string[]
    /** 完成後回調 */
    onComplete?: () => void
}

// ============================================================================
// Component
// ============================================================================

export default function SppbAssessmentForm({
    assessmentId,
    patientName = '',
    remainingTasks = [],
    onComplete,
}: SppbAssessmentFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const { register, control, setValue, handleSubmit } = useForm<SppbFormValues>({
        resolver: zodResolver(sppbSchema),
        defaultValues: {
            sideBySide: true,
            semiTandem: true,
            tandemSeconds: 10,
            gaitDistance: '4',
            gaitSeconds: null,
            gaitUnable: false,
            chairSeconds: null,
            chairUnable: false,
        },
    })

    const watched = useWatch({ control })

    // ============================================================================
    // 即時計分
    // ============================================================================

    const scores = useMemo(() => {
        const balanceResult: BalanceResult = {
            sideBySide: watched.sideBySide ?? true,
            semiTandem: watched.semiTandem ?? true,
            tandemSeconds: watched.tandemSeconds ?? 0,
        }

        const balance = calculateBalanceScore(balanceResult)
        const gait = watched.gaitUnable
            ? 0
            : calculateGaitScore(
                watched.gaitSeconds ?? null,
                (watched.gaitDistance === '3' ? 3 : 4)
            )
        const chair = watched.chairUnable
            ? 0
            : calculateChairScore(watched.chairSeconds ?? null)

        const total = calculateSppbTotal({ balance, gait, chair })
        const verdict = getSppbVerdict(total)

        return { balance, gait, chair, total, verdict }
    }, [watched])

    // ============================================================================
    // Submit
    // ============================================================================

    const onSubmit = async () => {
        setIsSubmitting(true)

        try {
            const supabase = createClient()

            // 先檢查是否已有 secondary_assessments 記錄
            const { data: existing } = await supabase
                .from('secondary_assessments')
                .select('id')
                .eq('assessment_id', assessmentId)
                .single()

            if (existing) {
                // UPDATE 現有記錄
                const { error } = await supabase
                    .from('secondary_assessments')
                    .update({ sppb_score: scores.total })
                    .eq('assessment_id', assessmentId)

                if (error) throw new Error(error.message)
            } else {
                // INSERT 新記錄
                const { error } = await supabase
                    .from('secondary_assessments')
                    .insert({
                        assessment_id: assessmentId,
                        sppb_score: scores.total,
                    })

                if (error) throw new Error(error.message)
            }

            logActivity(
                'SPPB 評估完成',
                `長者: ${patientName}, 總分: ${scores.total}/12, 判定: ${scores.verdict.label}`,
                'assessment',
                assessmentId
            )

            toast.success(`SPPB 評估已儲存！總分 ${scores.total}/12`)

            if (onComplete) {
                onComplete()
            } else {
                router.push('/icope')
            }

        } catch (err: any) {
            toast.error(err.message || '儲存失敗，請重試')
        } finally {
            setIsSubmitting(false)
        }
    }

    // ============================================================================
    // Render Helpers
    // ============================================================================

    /** 大面積 Radio 按鈕 */
    const RadioOption = ({
        checked,
        onClick,
        label,
        sublabel,
        variant = 'default',
    }: {
        checked: boolean
        onClick: () => void
        label: string
        sublabel?: string
        variant?: 'default' | 'success' | 'danger'
    }) => {
        const activeClasses = {
            default: 'bg-primary-600/20 border-primary-500/50 text-white',
            success: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
            danger: 'bg-red-500/20 border-red-500/50 text-red-400',
        }

        return (
            <button
                type="button"
                onClick={onClick}
                className={`w-full p-4 rounded-xl text-left transition-all border-2 min-h-[56px] ${checked
                        ? activeClasses[variant]
                        : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
                    }`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? 'border-current' : 'border-slate-600'
                        }`}>
                        {checked && <div className="w-2.5 h-2.5 rounded-full bg-current" />}
                    </div>
                    <div>
                        <p className="font-medium text-base">{label}</p>
                        {sublabel && <p className="text-xs opacity-60 mt-0.5">{sublabel}</p>}
                    </div>
                </div>
            </button>
        )
    }

    /** 分數指示器 */
    const ScoreBadge = ({ score, max, label }: { score: number; max: number; label: string }) => (
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
            <span className="text-sm text-slate-400">{label}</span>
            <span className={`text-lg font-bold ${score >= max * 0.75 ? 'text-emerald-400' :
                    score >= max * 0.5 ? 'text-amber-400' :
                        'text-red-400'
                }`}>
                {score}<span className="text-sm text-slate-600">/{max}</span>
            </span>
        </div>
    )

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Header */}
            <div className="glass-card p-5">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl">🦿</div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-white">SPPB 簡易身體表現功能量表</h2>
                        <p className="text-sm text-slate-400">
                            Short Physical Performance Battery
                            {patientName && <span className="ml-2">· 長者：<span className="text-white">{patientName}</span></span>}
                        </p>
                    </div>
                </div>
            </div>

            {/* ================================================================== */}
            {/* 1. 平衡測試 (0-4 分) */}
            {/* ================================================================== */}
            <div className="glass-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚖️</span>
                        <div>
                            <h3 className="text-lg font-bold text-white">平衡測試</h3>
                            <p className="text-xs text-slate-500">依序進行三種站立姿勢</p>
                        </div>
                    </div>
                    <ScoreBadge score={scores.balance} max={4} label="分數" />
                </div>

                {/* 並排站立 */}
                <div className="space-y-2">
                    <p className="text-sm text-slate-300 font-medium">
                        ① 並排站立（Side-by-side）
                        <span className="text-xs text-slate-500 ml-2">雙腳並排，維持 10 秒</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <RadioOption
                            checked={watched.sideBySide === true}
                            onClick={() => setValue('sideBySide', true)}
                            label="✓ 可維持 10 秒"
                            variant="success"
                        />
                        <RadioOption
                            checked={watched.sideBySide === false}
                            onClick={() => setValue('sideBySide', false)}
                            label="✗ 無法維持 10 秒"
                            variant="danger"
                        />
                    </div>
                </div>

                {/* 半並排站立 */}
                {watched.sideBySide && (
                    <div className="space-y-2">
                        <p className="text-sm text-slate-300 font-medium">
                            ② 半並排站立（Semi-tandem）
                            <span className="text-xs text-slate-500 ml-2">一腳腳跟靠另一腳中段，維持 10 秒</span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <RadioOption
                                checked={watched.semiTandem === true}
                                onClick={() => setValue('semiTandem', true)}
                                label="✓ 可維持 10 秒"
                                variant="success"
                            />
                            <RadioOption
                                checked={watched.semiTandem === false}
                                onClick={() => setValue('semiTandem', false)}
                                label="✗ 無法維持 10 秒"
                                variant="danger"
                            />
                        </div>
                    </div>
                )}

                {/* 直線站立 */}
                {watched.sideBySide && watched.semiTandem && (
                    <div className="space-y-2">
                        <p className="text-sm text-slate-300 font-medium">
                            ③ 直線站立（Tandem）
                            <span className="text-xs text-slate-500 ml-2">一腳腳跟緊貼另一腳腳尖</span>
                        </p>
                        <div className="flex items-center gap-3">
                            <label className="text-sm text-slate-400 shrink-0">維持秒數：</label>
                            <input
                                type="range"
                                min={0}
                                max={10}
                                step={1}
                                value={watched.tandemSeconds ?? 0}
                                onChange={e => setValue('tandemSeconds', Number(e.target.value))}
                                className="flex-1 h-3 rounded-full appearance-none cursor-pointer accent-primary-500"
                                style={{ background: `linear-gradient(to right, var(--primary-500) ${(watched.tandemSeconds ?? 0) * 10}%, rgba(255,255,255,0.1) ${(watched.tandemSeconds ?? 0) * 10}%)` }}
                            />
                            <span className="text-xl font-bold text-white w-16 text-center">
                                {watched.tandemSeconds ?? 0}
                                <span className="text-xs text-slate-600"> 秒</span>
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ================================================================== */}
            {/* 2. 步行速度測試 (0-4 分) */}
            {/* ================================================================== */}
            <div className="glass-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🚶</span>
                        <div>
                            <h3 className="text-lg font-bold text-white">步行速度測試</h3>
                            <p className="text-xs text-slate-500">一般步行速度計時</p>
                        </div>
                    </div>
                    <ScoreBadge score={scores.gait} max={4} label="分數" />
                </div>

                {/* 距離切換 */}
                <div className="space-y-2">
                    <p className="text-sm text-slate-300 font-medium">測試距離</p>
                    <div className="grid grid-cols-2 gap-2">
                        <RadioOption
                            checked={watched.gaitDistance === '4'}
                            onClick={() => setValue('gaitDistance', '4')}
                            label="4 公尺"
                            sublabel="標準距離"
                        />
                        <RadioOption
                            checked={watched.gaitDistance === '3'}
                            onClick={() => setValue('gaitDistance', '3')}
                            label="3 公尺"
                            sublabel="空間不足時"
                        />
                    </div>
                </div>

                {/* 無法完成 */}
                <RadioOption
                    checked={watched.gaitUnable === true}
                    onClick={() => setValue('gaitUnable', !watched.gaitUnable)}
                    label="受試者無法完成步行測試"
                    variant="danger"
                />

                {/* 秒數輸入 */}
                {!watched.gaitUnable && (
                    <div>
                        <label className="text-sm text-slate-300 font-medium block mb-1.5">
                            步行時間（秒）
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={watched.gaitSeconds ?? ''}
                            onChange={e => setValue('gaitSeconds', e.target.value === '' ? null : Number(e.target.value))}
                            className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white text-2xl font-bold text-center focus:border-primary-500 focus:outline-none"
                            placeholder="輸入秒數"
                        />
                    </div>
                )}
            </div>

            {/* ================================================================== */}
            {/* 3. 椅子起站測試 (0-4 分) */}
            {/* ================================================================== */}
            <div className="glass-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🪑</span>
                        <div>
                            <h3 className="text-lg font-bold text-white">椅子起站測試</h3>
                            <p className="text-xs text-slate-500">雙手交叉胸前，起立坐下 5 次計時</p>
                        </div>
                    </div>
                    <ScoreBadge score={scores.chair} max={4} label="分數" />
                </div>

                {/* 無法完成 */}
                <RadioOption
                    checked={watched.chairUnable === true}
                    onClick={() => setValue('chairUnable', !watched.chairUnable)}
                    label="受試者無法完成 5 次起立坐下"
                    variant="danger"
                />

                {/* 秒數輸入 */}
                {!watched.chairUnable && (
                    <div>
                        <label className="text-sm text-slate-300 font-medium block mb-1.5">
                            完成 5 次所需時間（秒）
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={watched.chairSeconds ?? ''}
                            onChange={e => setValue('chairSeconds', e.target.value === '' ? null : Number(e.target.value))}
                            className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white text-2xl font-bold text-center focus:border-primary-500 focus:outline-none"
                            placeholder="輸入秒數"
                        />
                    </div>
                )}
            </div>

            {/* ================================================================== */}
            {/* 總分摘要 */}
            {/* ================================================================== */}
            <div className={`glass-card p-5 ring-2 ${scores.verdict.severity === 'normal'
                    ? 'ring-emerald-500/30 bg-emerald-500/5'
                    : scores.verdict.severity === 'mild'
                        ? 'ring-amber-500/30 bg-amber-500/5'
                        : 'ring-red-500/30 bg-red-500/5'
                }`}>
                <div className="text-center mb-4">
                    <p className="text-sm text-slate-400 mb-1">SPPB 總分</p>
                    <p className={`text-5xl font-black ${scores.verdict.color}`}>
                        {scores.total}
                        <span className="text-xl text-slate-600">/12</span>
                    </p>
                    <p className={`text-lg font-bold mt-2 ${scores.verdict.color}`}>
                        {scores.verdict.label}
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <ScoreBadge score={scores.balance} max={4} label="平衡" />
                    <ScoreBadge score={scores.gait} max={4} label="步行" />
                    <ScoreBadge score={scores.chair} max={4} label="起站" />
                </div>

                {/* 分數量尺 */}
                <div className="mt-4 flex items-center gap-1 h-3">
                    {Array.from({ length: 12 }, (_, i) => (
                        <div
                            key={i}
                            className={`flex-1 h-full rounded-full transition-all ${i < scores.total
                                    ? scores.total >= 10
                                        ? 'bg-emerald-500'
                                        : scores.total >= 7
                                            ? 'bg-amber-500'
                                            : scores.total >= 4
                                                ? 'bg-orange-500'
                                                : 'bg-red-500'
                                    : 'bg-white/10'
                                }`}
                        />
                    ))}
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-slate-600">
                    <span>0（重度）</span>
                    <span>4（中度）</span>
                    <span>7（輕度）</span>
                    <span>10（正常）</span>
                </div>
            </div>

            {/* ================================================================== */}
            {/* 操作按鈕 */}
            {/* ================================================================== */}
            <div className="flex gap-3 sticky bottom-4">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex-1 py-4 rounded-xl bg-white/5 text-slate-400 text-base font-medium hover:bg-white/10 transition-colors"
                >
                    ← 返回
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 btn-accent text-base py-4 disabled:opacity-50"
                >
                    {isSubmitting ? '儲存中...' : '✓ 儲存 SPPB 結果'}
                </button>
            </div>
        </form>
    )
}
