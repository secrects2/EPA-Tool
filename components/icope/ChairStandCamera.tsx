'use client'

/**
 * SPPB 椅子起站測試 — 相機 + HUD + Supabase 整合
 * 使用手機後鏡頭（facingMode: environment）
 * 依賴 react-webcam（已在 BocciaCam 中使用）
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity-log'
import { useChairStandTest, type TestState, type ChairStandResult } from '@/hooks/useChairStandTest'
import { getChairStandVerdict } from '@/utils/sppbMath'
import type { Landmark3D } from '@/utils/sppbMath'

// ============================================================================
// Props
// ============================================================================

interface ChairStandCameraProps {
    /** 評估 ID — 用於 Supabase UPDATE */
    assessmentId: string
    /** 長者姓名 */
    patientName?: string
    /** 關閉鏡頭回調 */
    onClose?: () => void
}

// ============================================================================
// 狀態文字映射
// ============================================================================

const STATE_LABELS: Record<TestState, { text: string; emoji: string; color: string }> = {
    IDLE: { text: '偵測中...', emoji: '👁️', color: 'text-white/50' },
    READY: { text: '請坐好，準備開始', emoji: '🪑', color: 'text-amber-400' },
    RISING: { text: '站起來！', emoji: '⬆️', color: 'text-blue-400' },
    STANDING: { text: '站好了，坐下去！', emoji: '🧍', color: 'text-emerald-400' },
    SITTING_DOWN: { text: '坐下，再站起來！', emoji: '⬇️', color: 'text-orange-400' },
    FINISHED: { text: '測試完成！', emoji: '🎉', color: 'text-emerald-400' },
}

// ============================================================================
// Component
// ============================================================================

export default function ChairStandCamera({
    assessmentId,
    patientName = '',
    onClose,
}: ChairStandCameraProps) {
    const webcamRef = useRef<Webcam>(null)
    const poseRef = useRef<any>(null)
    const animFrameRef = useRef<number>(0)

    const [cameraReady, setCameraReady] = useState(false)
    const [poseLoaded, setPoseLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [result, setResult] = useState<ChairStandResult | null>(null)

    /** Supabase UPDATE + Toast */
    const handleComplete = useCallback(async (res: ChairStandResult) => {
        setResult(res)
        setSaving(true)

        try {
            const supabase = createClient()

            // 檢查 secondary_assessments 是否已存在
            const { data: existing } = await supabase
                .from('secondary_assessments')
                .select('id')
                .eq('assessment_id', assessmentId)
                .single()

            if (existing) {
                const { error } = await supabase
                    .from('secondary_assessments')
                    .update({
                        sppb_score: res.score,
                    })
                    .eq('assessment_id', assessmentId)

                if (error) throw new Error(error.message)
            } else {
                const { error } = await supabase
                    .from('secondary_assessments')
                    .insert({
                        assessment_id: assessmentId,
                        sppb_score: res.score,
                    })

                if (error) throw new Error(error.message)
            }

            logActivity(
                'SPPB 椅子起站 AI 測試完成',
                `長者: ${patientName}, 時間: ${res.timeSeconds}秒, 分數: ${res.score}/4`,
                'assessment',
                assessmentId
            )

            const verdict = getChairStandVerdict(res.score)
            toast.success(`測試完成！${res.timeSeconds}秒 → ${res.score}分（${verdict.label}）`)
        } catch (err: any) {
            toast.error('儲存失敗: ' + err.message)
        } finally {
            setSaving(false)
        }
    }, [assessmentId, patientName])

    const { repCount, testState, kneeAngle, elapsedTime, processPose, reset } =
        useChairStandTest({ onComplete: handleComplete })

    /** 初始化 MediaPipe Pose */
    useEffect(() => {
        let isMounted = true

        const initPose = async () => {
            try {
                // 動態 import 避免 SSR 問題
                const { Pose } = await import('@mediapipe/pose')

                const pose = new Pose({
                    locateFile: (file: string) =>
                        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
                })

                pose.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    enableSegmentation: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5,
                })

                pose.onResults((results: any) => {
                    if (!isMounted) return
                    if (results.poseLandmarks) {
                        processPose(results.poseLandmarks as Landmark3D[])
                    }
                })

                poseRef.current = pose
                if (isMounted) setPoseLoaded(true)
            } catch (err) {
                console.error('MediaPipe Pose 初始化失敗:', err)
                toast.error('骨架偵測引擎載入失敗')
            }
        }

        initPose()

        return () => {
            isMounted = false
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        }
    }, [processPose])

    /** 持續送幀給 Pose 引擎 */
    useEffect(() => {
        if (!cameraReady || !poseLoaded || !poseRef.current) return
        if (testState === 'FINISHED') return

        let running = true

        const sendFrame = async () => {
            if (!running || !webcamRef.current?.video) return

            const video = webcamRef.current.video
            if (video.readyState >= 2) {
                try {
                    await poseRef.current.send({ image: video })
                } catch {
                    // ignore frame errors
                }
            }

            if (running) {
                animFrameRef.current = requestAnimationFrame(sendFrame)
            }
        }

        animFrameRef.current = requestAnimationFrame(sendFrame)

        return () => {
            running = false
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        }
    }, [cameraReady, poseLoaded, testState])

    // 手機後鏡頭設定
    const videoConstraints = {
        width: 640,
        height: 480,
        facingMode: 'environment',
    }

    const stateInfo = STATE_LABELS[testState]
    const verdict = result ? getChairStandVerdict(result.score) : null

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
            {/* 相機畫面 */}
            <div className="relative flex-1">
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    className="absolute inset-0 w-full h-full object-cover"
                    videoConstraints={videoConstraints}
                    onUserMedia={() => setCameraReady(true)}
                    onUserMediaError={() => toast.error('無法開啟相機')}
                />

                {/* 載入中遮罩 */}
                {(!cameraReady || !poseLoaded) && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-white mt-4 text-lg font-medium">
                            {!cameraReady ? '開啟相機中...' : '載入骨架偵測引擎...'}
                        </p>
                    </div>
                )}

                {/* HUD — 高對比度數據面板 */}
                {cameraReady && poseLoaded && (
                    <>
                        {/* 頂部：狀態列 */}
                        <div className="absolute top-0 inset-x-0 z-10 bg-black/60 backdrop-blur-sm px-4 py-3 safe-top">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">{stateInfo.emoji}</span>
                                    <div>
                                        <p className={`text-lg font-bold ${stateInfo.color}`}>{stateInfo.text}</p>
                                        {patientName && (
                                            <p className="text-[10px] text-white/60">長者：{patientName}</p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-xl hover:bg-slate-200"
                                    title="關閉"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* 中央：大數字計數 */}
                        {testState !== 'FINISHED' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center">
                                    <p className="text-[120px] font-black text-white leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
                                        {repCount}
                                        <span className="text-4xl text-white/50">/5</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* 底部：數據列 */}
                        <div className="absolute bottom-0 inset-x-0 z-10 bg-black/60 backdrop-blur-sm px-4 py-3 safe-bottom">
                            {testState !== 'FINISHED' ? (
                                <div className="flex items-center justify-around">
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-white">{elapsedTime}s</p>
                                        <p className="text-[10px] text-white/60">經過時間</p>
                                    </div>
                                    <div className="w-px h-8 bg-white/20" />
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-white">{kneeAngle ?? '—'}°</p>
                                        <p className="text-[10px] text-white/60">膝關節角度</p>
                                    </div>
                                    <div className="w-px h-8 bg-white/20" />
                                    <div className="text-center">
                                        <p className={`text-3xl font-bold ${stateInfo.color}`}>{repCount}</p>
                                        <p className="text-[10px] text-white/60">完成次數</p>
                                    </div>
                                </div>
                            ) : result && verdict ? (
                                <div className="space-y-3">
                                    {/* 結果摘要 */}
                                    <div className="flex items-center justify-around">
                                        <div className="text-center">
                                            <p className="text-3xl font-bold text-white">{result.timeSeconds}s</p>
                                            <p className="text-[10px] text-white/60">總耗時</p>
                                        </div>
                                        <div className="w-px h-10 bg-white/20" />
                                        <div className="text-center">
                                            <p className={`text-5xl font-black ${verdict.color}`}>{result.score}</p>
                                            <p className="text-[10px] text-white/60">分數 / 4</p>
                                        </div>
                                        <div className="w-px h-10 bg-white/20" />
                                        <div className="text-center">
                                            <p className={`text-lg font-bold ${verdict.color}`}>{verdict.label}</p>
                                            <p className="text-[10px] text-white/60">判定</p>
                                        </div>
                                    </div>
                                    {/* 操作按鈕 */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                reset()
                                                setResult(null)
                                            }}
                                            className="flex-1 py-3 rounded-xl bg-white/20 text-white font-medium"
                                        >
                                            🔄 重測
                                        </button>
                                        <button
                                            onClick={onClose}
                                            disabled={saving}
                                            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"
                                        >
                                            {saving ? '儲存中...' : '✓ 完成'}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
