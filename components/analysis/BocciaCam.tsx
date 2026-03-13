'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import Webcam from 'react-webcam'
import { BiomechanicsEngine, type BiomechanicsMetrics } from '@/lib/analysis/biomechanics-engine'
import { downloadFramesCSV, downloadSummaryCSV, downloadExcel, type SessionSummary } from '@/lib/export/data-export'

// Stubs for modules not available in EPA Tool (originally from BocciaCam project)
async function saveRehabSession(_params: any): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    console.warn('saveRehabSession is not implemented in EPA Tool')
    return { success: true, sessionId: 'stub-session' }
}
function getAiPrescription(_metrics: any) {
    return { title: '分析完成', content: '請查看長輩詳情頁了解完整報告', color: 'border-blue-500', references: [], recommendedProducts: [] }
}

/**
 * BocciaCam - AI 視覺分析組件
 * 針對亞健康長輩（坐姿運動）優化的姿態分析
 * 
 * 包含專利 MVP 三大指標：
 * A. 手肘伸展度 (ROM)
 * B. 軀幹穩定度 (Trunk Stability)
 * C. 出手速度 (Release Velocity)
 * 
 * 以及 "The Brain" 診斷邏輯
 */

interface BocciaCamProps {
    elderId: string
    matchId?: string
    side: 'red' | 'blue'
    onMetricsUpdate?: (metrics: BocciaMetrics) => void
    onClose?: () => void
    className?: string
}

export interface BocciaMetrics {
    elbowROM: number | null
    trunkStability: number | null
    velocity: number | null
    // === Phase 2: 核心数据指标 ===
    coreStabilityAngle: number | null
    shoulderAngularVel: number | null
    elbowAngularVel: number | null
    wristAngularVel: number | null
    tremorDetected: boolean
    tremorFrequency: number | null
    compensationType: string | null
    compensationSeverity: number
    // === Phase 2: 场域信息 ===
    subjectLocked: boolean
    postureCorrection: number
    // === Phase 2.1: 手指张开检测 ===
    fingerSpreadAngle: number | null
    fingerReleaseDetected: boolean
    isArmExtended: boolean
    isTrunkStable: boolean
    isReadyToThrow: boolean
    stableSeconds: number
}

// MediaPipe Pose Landmark IDs
const LANDMARKS = {
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
}

// ============ 專利核心：3D 空間向量運算（排除視角干擾）============
// 使用 MediaPipe 的 3D 座標 (x, y, z) 進行真實空間角度計算
// 無論鏡頭角度為 0° 或 60°，系統都能計算出真實的關節角度與軀幹傾斜

type Point3D = { x: number; y: number; z: number }

/** 3D 向量點積法計算關節角度 (Shoulder-Elbow-Wrist) */
function calculateAngle3D(a: Point3D, b: Point3D, c: Point3D): number {
    // 專利下擺拋球優化 (Underhand Throw Optimization)：
    // 當手臂往正前方伸直時，相機深度的 Z 軸變化會被 MediaPipe 放縮導致 90 度的誤判。
    // 這裡我們針對 ROM 角度的計算，將 Z 軸的權重降低到 0.2 (20%)，
    // 讓系統更專注在正面的 X/Y 軸伸展度，同時保留一部分深度資訊。
    const zWeight = 0.2;
    const ba = { x: a.x - b.x, y: a.y - b.y, z: ((a.z || 0) - (b.z || 0)) * zWeight }
    const bc = { x: c.x - b.x, y: c.y - b.y, z: ((c.z || 0) - (b.z || 0)) * zWeight }

    // 點積 BA · BC
    const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z
    // 向量長度 |BA| 和 |BC|
    const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2)
    const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2)

    if (magBA === 0 || magBC === 0) return 0

    // cos(θ) = (BA · BC) / (|BA| × |BC|)
    const cosTheta = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
    return Math.acos(cosTheta) * (180 / Math.PI)
}

/** 3D 空間傾斜角：肩膀連線相對水平面的真實夾角 */
function calculateTilt3D(a: Point3D, b: Point3D): number {
    // 肩膀連線的 3D 向量（已是真實像素座標）
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = (b.z || 0) - (a.z || 0)

    // 水平面上的投影長度 (x-z 平面)
    const horizontalLength = Math.sqrt(dx * dx + dz * dz)

    // 傾斜角 = arctan(垂直差 / 水平投影長度)
    if (horizontalLength === 0) return Math.abs(dy) > 0.01 ? 90 : 0
    return Math.abs(Math.atan2(dy, horizontalLength) * (180 / Math.PI))
}

// ============ 專利核心：長寬比感知 (Aspect-Ratio Aware) ============
// MediaPipe 輸出正規化座標 (0.0~1.0)，但直式拍攝(9:16)時
// X軸和Y軸的像素尺度不同，直接計算會造成角度壓縮約 0.56 倍
// 此函式將正規化座標還原為真實像素座標，徹底消除長寬比干擾
function toRealPixels(
    landmark: { x: number; y: number; z: number; visibility?: number },
    imageWidth: number,
    imageHeight: number
): Point3D {
    return {
        x: landmark.x * imageWidth,
        y: landmark.y * imageHeight,
        // MediaPipe 文檔：z 與 x 同尺度，故乘以 imageWidth
        z: (landmark.z || 0) * imageWidth,
    }
}

const UPPER_BODY_CONNECTIONS: [number, number][] = [
    [11, 12], [11, 13], [13, 15],
    [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
]

export default function BocciaCam({
    elderId,
    matchId,
    side,
    onMetricsUpdate,
    onClose,
    className = ''
}: BocciaCamProps) {
    const webcamRef = useRef<Webcam>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const poseRef = useRef<any>(null)
    const stableTimerRef = useRef<number>(0)
    const lastStableRef = useRef<boolean>(false)
    const startTimeRef = useRef<number>(Date.now())

    // Phase 2: 生物力学引擎
    const engineRef = useRef<BiomechanicsEngine>(new BiomechanicsEngine())

    // 追蹤整個 session 的指標歷史
    const metricsHistoryRef = useRef<{ rom: number; tilt: number; velocity: number }[]>([])

    // 自動偵測投球 & 自動儲存
    const autoSaveCountRef = useRef<number>(0)
    const lastAutoSaveTimeRef = useRef<number>(0)
    const autoSavingRef = useRef<boolean>(false)
    const [autoSaveToast, setAutoSaveToast] = useState<string | null>(null)

    // 混合方案：手動標記投球
    const throwMarksRef = useRef<{ time: number; rom: number; tilt: number; velocity: number; coreStability: number | null; shoulderVel: number | null; elbowVel: number | null; wristVel: number | null }[]>([])
    const lastMarkTimeRef = useRef<number>(0)
    const [throwMarkCount, setThrowMarkCount] = useState(0)
    const [markToast, setMarkToast] = useState<string | null>(null)

    // 一旦偵測到人體就不再顯示「等待就位」
    const hasEverLockedRef = useRef<boolean>(false)

    // UI 節流：每 500ms 才更新一次顯示值，讓人眼可以清楚閱讀
    const lastUIUpdateRef = useRef<number>(0)
    const UI_THROTTLE_MS = 500

    // Phase 2: 进阶指标展开/折叠
    const [showAdvanced, setShowAdvanced] = useState(true)
    // Phase 2: 生物力学指标状态
    const [bioMetrics, setBioMetrics] = useState<BiomechanicsMetrics | null>(null)

    // Velocity Tracking
    const prevWristRef = useRef<{ x: number, y: number, z: number, time: number } | null>(null)

    const [metrics, setMetrics] = useState<BocciaMetrics>({
        elbowROM: null, trunkStability: null, velocity: null,
        coreStabilityAngle: null, shoulderAngularVel: null,
        elbowAngularVel: null, wristAngularVel: null,
        tremorDetected: false, tremorFrequency: null,
        compensationType: null, compensationSeverity: 0,
        subjectLocked: false, postureCorrection: 0,
        fingerSpreadAngle: null, fingerReleaseDetected: false,
        isArmExtended: true, isTrunkStable: true,
        isReadyToThrow: false, stableSeconds: 0,
    })

    // Patent "The Brain" Rules - Diagnostic Message
    const [diagnosticMsg, setDiagnosticMsg] = useState<{ text: string, color: string } | null>(null)

    const [cameraReady, setCameraReady] = useState(false)
    const [poseLoaded, setPoseLoaded] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    // 隊伍色彩
    const sideColors = side === 'red'
        ? { primary: '#EF4444', bg: 'bg-red-900/50', text: 'text-red-400', label: '🔴 紅隊' }
        : { primary: '#3B82F6', bg: 'bg-blue-900/50', text: 'text-blue-400', label: '🔵 藍隊' }

    const processResults = useCallback((results: any) => {
        const canvas = canvasRef.current
        const webcam = webcamRef.current
        if (!canvas || !webcam?.video) return

        const video = webcam.video
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (!results.poseLandmarks) return

        const landmarks = results.poseLandmarks
        const now = Date.now()
        const W = video.videoWidth || 640  // 像素寬度
        const H = video.videoHeight || 480  // 像素高度

        // 🛡️ 人體骨架守衛：需要完整上半身（雙肩+臀部+手臂）才進行分析
        // 僅靠手臂3關節不足以排除鍵盤等非人體誤判
        const rShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER]
        const lShoulder = landmarks[LANDMARKS.LEFT_SHOULDER]
        const rElbow = landmarks[LANDMARKS.RIGHT_ELBOW]
        const rWrist = landmarks[LANDMARKS.RIGHT_WRIST]
        const lHip = landmarks[LANDMARKS.LEFT_HIP]
        const rHip = landmarks[LANDMARKS.RIGHT_HIP]

        // 雙肩 + 右手臂 + 至少一側臀部 都需 visibility > 0.5
        const armVisible = Math.min(rShoulder?.visibility || 0, rElbow?.visibility || 0, rWrist?.visibility || 0) > 0.5
        const shouldersVisible = (lShoulder?.visibility || 0) > 0.5
        const hipVisible = Math.max(lHip?.visibility || 0, rHip?.visibility || 0) > 0.5

        if (!armVisible || !shouldersVisible || !hipVisible) {
            // 無完整人體骨架 → 不產生數據
            return
        }

        // 專利核心：長寬比感知轉換 (Aspect-Ratio Aware)
        // 將 MediaPipe 正規化座標 (0~1) 還原為真實像素座標
        // 直式 9:16 時 W=480, H=640，若不還原會導致角度壓縮 ~56%

        // 1. A. Elbow ROM (Shoulder-Elbow-Wrist)
        const shoulder = toRealPixels(landmarks[LANDMARKS.RIGHT_SHOULDER], W, H)
        const elbow = toRealPixels(landmarks[LANDMARKS.RIGHT_ELBOW], W, H)
        const wrist = toRealPixels(landmarks[LANDMARKS.RIGHT_WRIST], W, H)
        const rawElbowROM = calculateAngle3D(shoulder, elbow, wrist)
        const elbowROM = engineRef.current.applyFilter('elbowROM', rawElbowROM)

        // 2. B. Trunk Stability (3D Shoulder Tilt - 排除視角+长宽比干扰)
        const leftShoulder = toRealPixels(landmarks[LANDMARKS.LEFT_SHOULDER], W, H)
        const rightShoulder = toRealPixels(landmarks[LANDMARKS.RIGHT_SHOULDER], W, H)
        const rawTrunkTilt = calculateTilt3D(leftShoulder, rightShoulder)
        const trunkTilt = engineRef.current.applyFilter('trunkStability', rawTrunkTilt)

        // 3. C. Velocity (Wrist Speed) - Aspect-Ratio Aware
        let rawVelocity = 0
        const rawWristLandmark = landmarks[LANDMARKS.RIGHT_WRIST]
        if (rawWristLandmark && rawWristLandmark.visibility > 0.5) {
            if (prevWristRef.current) {
                const dt = (now - prevWristRef.current.time) / 1000
                if (dt > 0) {
                    // 使用真實像素座標計算速度
                    const rawWrist = landmarks[LANDMARKS.RIGHT_WRIST]
                    const realWrist = toRealPixels(rawWrist, W, H)
                    const dx = realWrist.x - prevWristRef.current.x
                    const dy = realWrist.y - prevWristRef.current.y
                    const dz = realWrist.z - prevWristRef.current.z
                    // 3D 歐式距離（像素級）
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
                    // 归一化速度：除以对角线长度来消除分辨率差异
                    const diagonal = Math.sqrt(W * W + H * H)
                    rawVelocity = Math.round((dist / diagonal / dt) * 100)
                }
            }
            const rawWristForRef = landmarks[LANDMARKS.RIGHT_WRIST]
            const realWristForRef = toRealPixels(rawWristForRef, W, H)
            prevWristRef.current = { x: realWristForRef.x, y: realWristForRef.y, z: realWristForRef.z, time: now }
        }
        const velocity = engineRef.current.applyFilter('velocity', rawVelocity)

        const isArmExtended = elbowROM >= 160
        const isTrunkStable = trunkTilt <= 15

        // Phase 2: 运行生物力学引擎
        const bio = engineRef.current.processFrame(landmarks, W, H, now)

        // 提取 y 座標供防偽出手判定使用
        const wristY = landmarks[LANDMARKS.RIGHT_WRIST]?.visibility > 0.5 ? toRealPixels(landmarks[LANDMARKS.RIGHT_WRIST], W, H).y : null
        const shoulderY = toRealPixels(landmarks[LANDMARKS.RIGHT_SHOULDER], W, H).y
        const hipY = toRealPixels(landmarks[LANDMARKS.RIGHT_HIP], W, H).y

        const isRelease = engineRef.current.updateReleasePoint(velocity, elbowROM, wristY, shoulderY, hipY, bio.fingerReleaseDetected)

        bio.elbowROM = Math.round(elbowROM)
        bio.elbowROM_raw = Math.round(rawElbowROM)
        bio.trunkStability = Math.round(trunkTilt)
        bio.trunkStability_raw = Math.round(rawTrunkTilt)
        bio.velocity = Math.round(velocity)
        bio.velocity_raw = Math.round(rawVelocity)
        bio.isReleaseFrame = isRelease

        // --- PATENT LOGIC: "The Brain" Diagnostic Rules ---
        let diagText = null
        let diagColor = 'text-muted-foreground'

        // 偵測到真實出手瞬間！(最高優先級顯示)
        if (bio.isReleaseFrame) {
            diagText = "🎉 成功投出！(Release Point Detected)"
            diagColor = "text-yellow-400"

            // ─── 自動出手檢測已停用（混合方案：改用手動標記 + Session 平均值）───
            // 保留 isReleaseFrame 作為 HUD 提示，但不再觸發自動儲存
            if (false) {
                const now2 = Date.now()
                const cooldownMs = 5000
                const _unused = !autoSavingRef.current && (now2 - lastAutoSaveTimeRef.current) > cooldownMs
                autoSavingRef.current = true
                lastAutoSaveTimeRef.current = now2
                autoSaveCountRef.current += 1
                const throwNum = autoSaveCountRef.current
                const currentHistory = [...metricsHistoryRef.current]
                const currentBioHistory = engineRef.current.getFrameHistory()
                const dur = Math.round((now2 - startTimeRef.current) / 1000)

                    // 後台非同步儲存（不阻塞即時分析）
                    ; (async () => {
                        try {
                            const romVals = currentHistory.map(h => h.rom).filter(v => v > 0)
                            const tiltVals = currentHistory.map(h => h.tilt).filter(v => v >= 0)
                            const velVals = currentHistory.map(h => h.velocity).filter(v => v > 0)
                            const avgR = romVals.length > 0 ? Math.round(romVals.reduce((a, b) => a + b, 0) / romVals.length) : 0
                            const avgT = tiltVals.length > 0 ? Math.round(tiltVals.reduce((a, b) => a + b, 0) / tiltVals.length) : 0
                            const avgV = velVals.length > 0 ? Math.round(velVals.reduce((a, b) => a + b, 0) / velVals.length) : 0
                            const tFrames = currentBioHistory.filter(b => b.tremorDetected)
                            const cFrames = currentBioHistory.filter(b => b.compensationType !== null)
                            const payload = {
                                elbow_rom: avgR, avg_rom: avgR,
                                trunk_stability: avgT, avg_trunk_tilt: avgT,
                                avg_velocity: avgV,
                                max_rom: romVals.length > 0 ? Math.max(...romVals) : null,
                                min_rom: romVals.length > 0 ? Math.min(...romVals) : null,
                                throw_count: throwNum,
                                duration_seconds: dur,
                                stable_ratio: currentHistory.length > 0 ? Math.round((currentHistory.filter(h => h.rom >= 160 && h.tilt <= 15).length / currentHistory.length) * 100) : 0,
                                core_stability_angle: currentBioHistory.length > 0 ? Math.round(currentBioHistory.reduce((s, b) => s + (b.coreStabilityAngle || 0), 0) / currentBioHistory.length * 10) / 10 : null,
                                avg_shoulder_angular_vel: currentBioHistory.length > 0 ? Math.round(currentBioHistory.reduce((s, b) => s + (b.shoulderAngularVel || 0), 0) / currentBioHistory.length) : null,
                                avg_elbow_angular_vel: currentBioHistory.length > 0 ? Math.round(currentBioHistory.reduce((s, b) => s + (b.elbowAngularVel || 0), 0) / currentBioHistory.length) : null,
                                avg_wrist_angular_vel: currentBioHistory.length > 0 ? Math.round(currentBioHistory.reduce((s, b) => s + (b.wristAngularVel || 0), 0) / currentBioHistory.length) : null,
                                tremor_detected_ratio: currentBioHistory.length > 0 ? Math.round((tFrames.length / currentBioHistory.length) * 100) : 0,
                                tremor_avg_frequency: tFrames.length > 0 ? Math.round(tFrames.reduce((s, b) => s + (b.tremorFrequency || 0), 0) / tFrames.length * 10) / 10 : null,
                                compensation_detected_ratio: currentBioHistory.length > 0 ? Math.round((cFrames.length / currentBioHistory.length) * 100) : 0,
                                compensation_types: [...new Set(cFrames.map(b => b.compensationType).filter(Boolean))],
                                posture_correction_avg: currentBioHistory.length > 0 ? Math.round(currentBioHistory.reduce((s, b) => s + (b.postureCorrection || 0), 0) / currentBioHistory.length * 10) / 10 : 0,
                            }
                            await saveRehabSession({ elderId, matchId, sportType: 'boccia', durationSeconds: dur, metrics: payload })
                            setAutoSaveToast(`✅ 第 ${throwNum} 次投擲已自動儲存`)
                            setTimeout(() => setAutoSaveToast(null), 3000)
                        } catch (e) {
                            console.error('自動儲存失敗:', e)
                            setAutoSaveToast(`⚠️ 第 ${throwNum} 次自動儲存失敗`)
                            setTimeout(() => setAutoSaveToast(null), 3000)
                        } finally {
                            autoSavingRef.current = false
                        }
                    })()
            }
        }
        // Rule 1: Safety/Fall Risk
        else if (!isTrunkStable) {
            diagText = `⚠️ 警告：身體明顯傾斜 (>15°，目前 ${Math.round(trunkTilt)}°)`
            diagColor = "text-red-500"
        }
        // Rule 2: Spasticity/Tone Indicator
        else if (!isArmExtended) {
            diagText = `ℹ️ 提示：手臂未完全伸展 (目前 ${Math.round(elbowROM)}°)`
            diagColor = "text-orange-400"
        }
        // Rule 3: Performance/Power (Good Shot)
        else if (isArmExtended && isTrunkStable && velocity > 50) {
            diagText = "✅ 優秀：動作穩定且具發力速度！"
            diagColor = "text-green-400"
        }
        else if (isArmExtended && isTrunkStable) {
            diagText = "🔵 動作穩定，準備投球..."
            diagColor = "text-blue-400"
        }

        setDiagnosticMsg(diagText ? { text: diagText, color: diagColor } : null)
        // --------------------------------------------------

        // Record history
        metricsHistoryRef.current.push({
            rom: Math.round(elbowROM),
            tilt: Math.round(trunkTilt),
            velocity: Math.round(velocity)
        })

        // Stability Check
        const isCurrentlyStable = isArmExtended && isTrunkStable
        if (isCurrentlyStable) {
            if (lastStableRef.current) {
                stableTimerRef.current += 1 / 30
            } else {
                stableTimerRef.current = 0
            }
        } else {
            stableTimerRef.current = 0
        }
        lastStableRef.current = isCurrentlyStable

        const stableSeconds = Math.min(stableTimerRef.current, 5)
        const isReadyToThrow = stableSeconds >= 3

        // Drawing Skeleton
        const isGood = isArmExtended && isTrunkStable
        const skeletonColor = isGood ? sideColors.primary : '#EF4444'
        const pointColor = isGood ? sideColors.primary : '#DC2626'

        ctx.strokeStyle = skeletonColor
        ctx.lineWidth = 3
        ctx.lineCap = 'round'

        for (const [startIdx, endIdx] of UPPER_BODY_CONNECTIONS) {
            const start = landmarks[startIdx]
            const end = landmarks[endIdx]
            if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
                ctx.beginPath()
                ctx.moveTo(start.x * canvas.width, start.y * canvas.height)
                ctx.lineTo(end.x * canvas.width, end.y * canvas.height)
                ctx.stroke()
            }
        }

        for (let i = 11; i <= 24; i++) {
            const lm = landmarks[i]
            if (lm && lm.visibility > 0.5) {
                ctx.fillStyle = pointColor
                ctx.beginPath()
                ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI)
                ctx.fill()
                ctx.strokeStyle = '#fff'
                ctx.lineWidth = 2
                ctx.stroke()
            }
        }

        const rawElbow = landmarks[LANDMARKS.RIGHT_ELBOW]
        if (rawElbow && rawElbow.visibility > 0.5) {
            ctx.font = 'bold 16px sans-serif'
            ctx.fillStyle = isArmExtended ? sideColors.primary : '#EF4444'
            ctx.fillText(`${Math.round(elbowROM)}°`, rawElbow.x * canvas.width + 10, rawElbow.y * canvas.height - 10)
        }

        // Draw Velocity
        if (rawWristLandmark && rawWristLandmark.visibility > 0.5 && velocity > 10) {
            ctx.font = 'bold 14px monospace'
            ctx.fillStyle = '#10B981'
            ctx.fillText(`↑${velocity}`, rawWristLandmark.x * canvas.width + 10, rawWristLandmark.y * canvas.height + 20)
        }

        // 一旦偵測到人體，永不回退「等待就位」
        if (bio.subjectLocked) hasEverLockedRef.current = true

        const newMetrics: BocciaMetrics = {
            elbowROM: Math.round(elbowROM),
            trunkStability: Math.round(trunkTilt),
            velocity: velocity,
            coreStabilityAngle: bio.coreStabilityAngle,
            shoulderAngularVel: bio.shoulderAngularVel,
            elbowAngularVel: bio.elbowAngularVel,
            wristAngularVel: bio.wristAngularVel,
            tremorDetected: bio.tremorDetected,
            tremorFrequency: bio.tremorFrequency,
            compensationType: bio.compensationType,
            compensationSeverity: bio.compensationSeverity,
            subjectLocked: bio.subjectLocked,
            postureCorrection: bio.postureCorrection,
            fingerSpreadAngle: bio.fingerSpreadAngle,
            fingerReleaseDetected: bio.fingerReleaseDetected,
            isArmExtended, isTrunkStable, isReadyToThrow,
            stableSeconds: Math.round(stableSeconds * 10) / 10,
        }
        // ─── UI 節流：每 500ms 才推送到 React state ───
        // 內部計算仍以 30fps 運行，但畫面數值每秒只刷新 2 次
        const shouldUpdateUI = (now - lastUIUpdateRef.current) >= UI_THROTTLE_MS
        // 出手偵測等重要事件跳過節流立即顯示
        const isImportantEvent = bio.isReleaseFrame || bio.tremorDetected || bio.compensationType !== null

        if (shouldUpdateUI || isImportantEvent) {
            lastUIUpdateRef.current = now
            setMetrics(newMetrics)
            setBioMetrics(bio)
            onMetricsUpdate?.(newMetrics)
        }
    }, [onMetricsUpdate, sideColors.primary])

    // Session Report State
    const [sessionReport, setSessionReport] = useState<{ session_id: string; metrics: any; prescription: any } | null>(null)

    // Remove Live Prescription (User requested post-session only)
    /* 
    const [prescription, setPrescription] = useState... 
    useEffect...
    */

    // 混合方案：手動標記這一球
    const handleMarkThrow = () => {
        const now = Date.now()
        if (now - lastMarkTimeRef.current < 1000) return // 1秒冷却
        lastMarkTimeRef.current = now

        const snap = {
            time: now - startTimeRef.current,
            rom: metrics.elbowROM ?? 0,
            tilt: metrics.trunkStability ?? 0,
            velocity: metrics.velocity ?? 0,
            coreStability: metrics.coreStabilityAngle,
            shoulderVel: metrics.shoulderAngularVel,
            elbowVel: metrics.elbowAngularVel,
            wristVel: metrics.wristAngularVel,
        }
        throwMarksRef.current.push(snap)
        setThrowMarkCount(throwMarksRef.current.length)
        setMarkToast(`📌 第 ${throwMarksRef.current.length} 球已標記`)
        setTimeout(() => setMarkToast(null), 1500)
    }

    // 儲存分析結果到 training_sessions
    const handleSaveAndStop = async () => {
        setSaving(true)
        try {
            const history = metricsHistoryRef.current
            const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000)

            // 計算摘要指標
            const romValues = history.map(h => h.rom).filter(v => v > 0)
            const tiltValues = history.map(h => h.tilt).filter(v => v >= 0)
            const velocityValues = history.map(h => h.velocity).filter(v => v > 0)

            const avgRom = romValues.length > 0 ? Math.round(romValues.reduce((a, b) => a + b, 0) / romValues.length) : (metrics.elbowROM || 0)
            const avgTilt = tiltValues.length > 0 ? Math.round(tiltValues.reduce((a, b) => a + b, 0) / tiltValues.length) : (metrics.trunkStability || 0)
            const avgVelocity = velocityValues.length > 0 ? Math.round(velocityValues.reduce((a, b) => a + b, 0) / velocityValues.length) : (metrics.velocity || 0)

            // Phase 2: 获取生物力学引擎的帧历史
            const bioHistory = engineRef.current.getFrameHistory()
            const tremorFrames = bioHistory.filter(b => b.tremorDetected)
            const compFrames = bioHistory.filter(b => b.compensationType !== null)

            const metricsPayload = {
                elbow_rom: avgRom,
                trunk_stability: avgTilt,
                avg_velocity: avgVelocity,
                max_rom: romValues.length > 0 ? Math.max(...romValues) : null,
                min_rom: romValues.length > 0 ? Math.min(...romValues) : null,
                avg_rom: avgRom,
                avg_trunk_tilt: avgTilt,
                throw_count: romValues.length,
                stable_ratio: history.length > 0
                    ? Math.round((history.filter(h => h.rom >= 160 && h.tilt <= 15).length / history.length) * 100)
                    : 0,
                // Phase 2: 进阶指标
                core_stability_angle: bioHistory.length > 0
                    ? Math.round(bioHistory.reduce((s, b) => s + (b.coreStabilityAngle || 0), 0) / bioHistory.length * 10) / 10
                    : null,
                avg_shoulder_angular_vel: bioHistory.length > 0
                    ? Math.round(bioHistory.reduce((s, b) => s + (b.shoulderAngularVel || 0), 0) / bioHistory.length)
                    : null,
                avg_elbow_angular_vel: bioHistory.length > 0
                    ? Math.round(bioHistory.reduce((s, b) => s + (b.elbowAngularVel || 0), 0) / bioHistory.length)
                    : null,
                avg_wrist_angular_vel: bioHistory.length > 0
                    ? Math.round(bioHistory.reduce((s, b) => s + (b.wristAngularVel || 0), 0) / bioHistory.length)
                    : null,
                tremor_detected_ratio: bioHistory.length > 0
                    ? Math.round((tremorFrames.length / bioHistory.length) * 100)
                    : 0,
                tremor_avg_frequency: tremorFrames.length > 0
                    ? Math.round(tremorFrames.reduce((s, b) => s + (b.tremorFrequency || 0), 0) / tremorFrames.length * 10) / 10
                    : null,
                compensation_detected_ratio: bioHistory.length > 0
                    ? Math.round((compFrames.length / bioHistory.length) * 100)
                    : 0,
                compensation_types: [...new Set(compFrames.map(b => b.compensationType).filter(Boolean))],
                posture_correction_avg: bioHistory.length > 0
                    ? Math.round(bioHistory.reduce((s, b) => s + (b.postureCorrection || 0), 0) / bioHistory.length * 10) / 10
                    : 0,
                // 混合方案：手動標記的每球快照
                manual_throw_count: throwMarksRef.current.length,
                throw_marks: throwMarksRef.current,
            }

            // 使用共享的 AI 處方引擎（與長者詳情頁一致）
            const aiPrescription = getAiPrescription(metricsPayload)

            const result = await saveRehabSession({
                elderId,
                matchId,
                sportType: 'boccia',
                durationSeconds,
                metrics: metricsPayload,
            })

            if (result.success && result.sessionId) {
                setSaved(true)
                // Show Report instead of closing immediately
                setSessionReport({
                    session_id: result.sessionId,
                    metrics: metricsPayload,
                    prescription: aiPrescription
                })
            } else {
                setError(result.error || '儲存失敗')
            }
        } catch (err: any) {
            setError(err.message || '儲存時發生錯誤')
        } finally {
            setSaving(false)
        }
    }

    // 初始化 MediaPipe Pose (Custom Loop Refactor)
    useEffect(() => {
        let requestAnimationId: number

        const initPose = async () => {
            try {
                const { Pose } = await import('@mediapipe/pose')

                const pose = new Pose({
                    locateFile: (file: string) =>
                        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
                })

                pose.setOptions({
                    modelComplexity: 1, smoothLandmarks: true,
                    enableSegmentation: false,
                    minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
                })

                pose.onResults(processResults)
                poseRef.current = pose
                setPoseLoaded(true)

                // Custom Frame Loop
                const sendFrame = async () => {
                    if (webcamRef.current?.video && webcamRef.current.video.readyState === 4) {
                        try {
                            await pose.send({ image: webcamRef.current.video })
                        } catch (err) {
                            console.error('Pose send error:', err)
                        }
                    }
                    requestAnimationId = requestAnimationFrame(sendFrame)
                }

                sendFrame()

            } catch (err: any) {
                console.error('MediaPipe 初始化失敗:', err)
                setError(err.message || '無法載入 AI 模型')
            }
        }

        initPose()

        return () => {
            if (requestAnimationId) cancelAnimationFrame(requestAnimationId)
            if (poseRef.current) poseRef.current.close()
        }
    }, [processResults])

    // Memoize video constraints to prevent re-renders triggering stream restart
    const videoConstraints = React.useMemo(() => ({
        width: 640,
        height: 480,
        facingMode: 'environment'
    }), [])

    // Render Report View if sessionReport exists
    if (sessionReport) {
        return (
            <div className={`relative bg-gray-900 flex flex-col items-center justify-start p-4 pt-8 h-full overflow-y-auto ${className}`}>
                <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-fade-in-up">
                    <div className="text-center border-b pb-4 border-border/50">
                        <h3 className="text-2xl font-extrabold text-foreground">📊 AI 檢測報告</h3>
                        <p className="text-sm text-muted-foreground mt-1">Detection Complete — 3D 空間向量分析</p>
                    </div>

                    {/* 3 Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 bg-background rounded-xl">
                            <p className="text-xs text-muted-foreground mb-1">手肘 ROM</p>
                            <p className={`text-2xl font-extrabold ${sessionReport.metrics.avg_rom < 160 ? 'text-orange-500' : 'text-foreground'}`}>
                                {sessionReport.metrics.avg_rom}°
                            </p>
                        </div>
                        <div className="text-center p-3 bg-background rounded-xl">
                            <p className="text-xs text-muted-foreground mb-1">軀幹傾斜</p>
                            <p className={`text-2xl font-extrabold ${sessionReport.metrics.avg_trunk_tilt > 15 ? 'text-red-500' : 'text-foreground'}`}>
                                {sessionReport.metrics.avg_trunk_tilt}°
                            </p>
                        </div>
                        <div className="text-center p-3 bg-background rounded-xl">
                            <p className="text-xs text-muted-foreground mb-1">出手速度</p>
                            <p className="text-2xl font-extrabold text-emerald-600">
                                {sessionReport.metrics.avg_velocity}
                            </p>
                        </div>
                    </div>

                    {/* 穩定率 */}
                    <div className="flex items-center justify-between p-3 bg-background rounded-xl">
                        <span className="text-sm font-bold text-gray-600">動作穩定率</span>
                        <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${(sessionReport.metrics.stable_ratio || 0) >= 70 ? 'bg-green-500' : (sessionReport.metrics.stable_ratio || 0) >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${sessionReport.metrics.stable_ratio || 0}%` }}
                                />
                            </div>
                            <span className="text-lg font-extrabold text-foreground">{sessionReport.metrics.stable_ratio || 0}%</span>
                        </div>
                    </div>

                    {/* 進階生物力學數據 */}
                    <div className="rounded-xl border border-border overflow-hidden">
                        <div className="bg-background px-4 py-2 border-b border-border">
                            <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">進階生物力學數據</h5>
                        </div>
                        <div className="p-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 bg-background rounded-lg text-center">
                                    <p className="text-[10px] text-muted-foreground">中軸偏移</p>
                                    <p className={`text-lg font-bold ${(sessionReport.metrics.core_stability_angle || 0) > 15 ? 'text-red-500' : 'text-cyan-600'}`}>
                                        {sessionReport.metrics.core_stability_angle ?? '--'}°
                                    </p>
                                </div>
                                <div className="p-2 bg-background rounded-lg text-center">
                                    <p className="text-[10px] text-muted-foreground">震顫</p>
                                    <p className={`text-lg font-bold ${(sessionReport.metrics.tremor_detected_ratio || 0) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        {sessionReport.metrics.tremor_detected_ratio != null ? `${sessionReport.metrics.tremor_detected_ratio}%` : '無'}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2 bg-background rounded-lg text-center">
                                    <p className="text-[10px] text-muted-foreground">肩角速</p>
                                    <p className="text-sm font-bold text-purple-600">{sessionReport.metrics.avg_shoulder_angular_vel ?? '--'}°/s</p>
                                </div>
                                <div className="p-2 bg-background rounded-lg text-center">
                                    <p className="text-[10px] text-muted-foreground">肘角速</p>
                                    <p className="text-sm font-bold text-purple-600">{sessionReport.metrics.avg_elbow_angular_vel ?? '--'}°/s</p>
                                </div>
                                <div className="p-2 bg-background rounded-lg text-center">
                                    <p className="text-[10px] text-muted-foreground">腕角速</p>
                                    <p className="text-sm font-bold text-purple-600">{sessionReport.metrics.avg_wrist_angular_vel ?? '--'}°/s</p>
                                </div>
                            </div>
                            {(sessionReport.metrics.compensation_detected_ratio || 0) > 0 && (
                                <div className="p-2 bg-orange-50 rounded-lg border border-orange-100 flex items-center gap-2">
                                    <span className="text-orange-500">⚠️</span>
                                    <div>
                                        <p className="text-xs font-bold text-orange-700">代償動作 {sessionReport.metrics.compensation_detected_ratio}%</p>
                                        {sessionReport.metrics.compensation_types?.length > 0 && (
                                            <p className="text-[10px] text-orange-500">{sessionReport.metrics.compensation_types.join(', ')}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 手動標記的每球快照 */}
                    {sessionReport.metrics.throw_marks?.length > 0 && (
                        <div className="rounded-xl border border-amber-200 overflow-hidden">
                            <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                                <h5 className="text-xs font-bold text-amber-700 uppercase tracking-widest">📌 手動標記投球 ({sessionReport.metrics.manual_throw_count} 球)</h5>
                            </div>
                            <div className="p-3 space-y-2">
                                {sessionReport.metrics.throw_marks.map((t: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-amber-50/50 rounded-lg text-sm">
                                        <span className="font-bold text-amber-700">#{i + 1}</span>
                                        <span className="text-gray-600">ROM {t.rom}°</span>
                                        <span className="text-gray-600">傾斜 {t.tilt}°</span>
                                        <span className="text-emerald-600 font-bold">速度 {t.velocity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI 處方卡片 */}
                    <div className={`p-5 rounded-xl border-l-4 ${sessionReport.prescription.color} bg-card shadow-sm`}>
                        <h4 className="font-bold text-lg mb-2">{sessionReport.prescription.title}</h4>
                        <p className="text-sm opacity-90">{sessionReport.prescription.content}</p>
                        {sessionReport.prescription.references && sessionReport.prescription.references.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/50">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">📚 學術依據 References</p>
                                {sessionReport.prescription.references.map((ref: string, idx: number) => (
                                    <p key={idx} className="text-[10px] text-muted-foreground leading-relaxed">[{idx + 1}] {ref}</p>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* AI 智能推薦 - 與長者詳情頁一致 */}
                    {sessionReport.prescription.recommendedProducts && sessionReport.prescription.recommendedProducts.length > 0 && (
                        <div className="p-5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-card relative overflow-hidden">
                            <div className="absolute -top-4 -right-4 text-7xl opacity-5">💡</div>
                            <h4 className="font-bold text-base text-indigo-900 mb-3 flex items-center gap-2 relative z-10">
                                <span>✨</span> AI 智能推薦
                            </h4>
                            <div className="space-y-2 relative z-10">
                                {sessionReport.prescription.recommendedProducts.map((product: any, idx: number) => (
                                    <div key={idx} className="bg-card/90 backdrop-blur-sm p-3 rounded-xl flex items-center gap-3 shadow-card border border-indigo-50">
                                        <div className="text-2xl bg-indigo-50/50 w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0">{product.icon}</div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-foreground text-sm">{product.name}</p>
                                            <p className="text-xs text-gray-600 mt-0.5">{product.reason}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}




                    <button
                        onClick={onClose}
                        className="w-full py-4 rounded-xl bg-gray-900 text-white font-bold text-lg hover:bg-black transition-colors shadow-lg mt-2"
                    >
                        關閉並返回
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className={`relative bg-black overflow-hidden flex flex-col ${className}`}>
            {/* Top Bar - Transparent Overlay */}
            <div className={`absolute top-0 left-0 right-0 z-20 p-4 flex justify-end items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none`}>
                {/* Team Badge - Move to right */}
                <div className={`px-3 py-1 bg-black/50 backdrop-blur rounded-full border border-white/10 flex items-center gap-2`}>
                    <div className={`w-2 h-2 rounded-full ${side === 'red' ? 'bg-red-500' : 'bg-primary/100'}`} />
                    <span className="text-white font-mono text-xs opacity-70">{elderId.slice(0, 4)}...</span>
                </div>
            </div>

            {/* Webcam - Expand to fill remaining space */}
            <div className="relative flex-1 w-full bg-black" style={{ minHeight: '45vh' }}>
                <Webcam
                    ref={webcamRef} audio={false}
                    // Remove mirrored for back camera
                    className="absolute inset-0 w-full h-full object-cover"
                    videoConstraints={videoConstraints}
                    onUserMedia={() => setCameraReady(true)}
                    onUserMediaError={() => setError('無法存取相機')}
                />
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-cover"
                // Remove scaleX(-1) if not mirrored
                />

                {/* Diagnostic Overlay - Moved to Top Left & Smaller */}
                {diagnosticMsg && (
                    <div className="absolute top-4 left-4 z-10 max-w-[70%]">
                        <div className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 shadow-lg flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${diagnosticMsg.color === 'text-red-500' ? 'bg-red-500 animate-pulse' : diagnosticMsg.color === 'text-green-400' ? 'bg-green-400' : 'bg-blue-400'}`} />
                            <p className={`font-bold text-sm text-white`}>
                                {diagnosticMsg.text}
                            </p>
                        </div>
                    </div>
                )}

                {!poseLoaded && !error && (
                    <div className="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center text-white">
                        <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-sm">載入 AI 模型中...</p>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center text-white p-6">
                        <span className="text-4xl mb-3">⚠️</span>
                        <p className="text-sm text-center text-red-300">{error}</p>
                    </div>
                )}

                {/* Saved Overlay */}
                {saved && (
                    <div className="absolute inset-0 bg-green-900/90 flex flex-col items-center justify-center text-white z-50">
                        <span className="text-6xl mb-4">✅</span>
                        <p className="text-xl font-extrabold">數據已儲存！</p>
                    </div>
                )}

                {metrics.isReadyToThrow && !saved && !diagnosticMsg && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-500/90 text-white px-4 py-2 rounded-full font-bold text-sm animate-pulse backdrop-blur-sm z-10 shadow-lg shadow-green-500/20">
                        準備投球
                    </div>
                )}
            </div>

            {/* Metrics Dashboard */}
            <div className="p-3 bg-gray-800 space-y-3 overflow-y-auto" style={{ maxHeight: '40vh' }}>
                {/* Phase 2: 主体锁定 & 坐姿状态指示器 */}
                <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Medical Rehab Data (即時醫療數據)</p>
                    <div className="flex items-center gap-2">
                        {metrics.subjectLocked && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />锁定中
                            </span>
                        )}
                        {metrics.postureCorrection > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-800">
                                坐姿修正 {metrics.postureCorrection}°
                            </span>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-xl p-2 text-center min-w-0 ${metrics.isArmExtended ? sideColors.bg : 'bg-red-900/50'}`}>
                        <p className="text-[10px] text-muted-foreground mb-0.5 truncate">肘部 ROM</p>
                        <p className={`text-xl font-extrabold ${metrics.isArmExtended ? sideColors.text : 'text-red-400'}`}>
                            {metrics.elbowROM !== null ? `${metrics.elbowROM}°` : '--'}
                        </p>
                    </div>

                    <div className={`rounded-xl p-2 text-center min-w-0 ${metrics.isTrunkStable ? sideColors.bg : 'bg-red-900/50'}`}>
                        <p className="text-[10px] text-muted-foreground mb-0.5 truncate">軀幹傾斜</p>
                        <p className={`text-xl font-extrabold ${metrics.isTrunkStable ? sideColors.text : 'text-red-400'}`}>
                            {metrics.trunkStability !== null ? `${metrics.trunkStability}°` : '--'}
                        </p>
                    </div>

                    <div className="rounded-xl p-2 text-center min-w-0 bg-gray-700/50">
                        <p className="text-[10px] text-muted-foreground mb-0.5 truncate">出手速度</p>
                        <p className="text-xl font-extrabold text-emerald-400 truncate">
                            {metrics.velocity ? metrics.velocity.toFixed(2) : '--'}
                        </p>
                    </div>
                </div>

                {/* Phase 2: 可折叠进阶指标面板 */}
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-gray-700/30 hover:bg-gray-700/50 transition-colors"
                >
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Advanced Bio-metrics (进阶指标)</span>
                    <span className="text-muted-foreground text-xs">{showAdvanced ? '▲' : '▼'}</span>
                </button>

                {showAdvanced && bioMetrics && (
                    <div className="space-y-2 animate-fade-in">
                        {/* 中轴稳定度 */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg p-2 bg-gray-700/30 text-center">
                                <p className="text-[10px] text-muted-foreground">中轴偏移</p>
                                <p className={`text-lg font-bold ${(bioMetrics.coreStabilityAngle || 0) > 15 ? 'text-red-400' : 'text-cyan-400'}`}>
                                    {bioMetrics.coreStabilityAngle ?? '--'}°
                                </p>
                            </div>
                            <div className="rounded-lg p-2 bg-gray-700/30 text-center">
                                <p className="text-[10px] text-muted-foreground">震颤</p>
                                <p className={`text-lg font-bold ${bioMetrics.tremorDetected ? 'text-red-400' : 'text-green-400'}`}>
                                    {bioMetrics.tremorDetected ? `${bioMetrics.tremorFrequency} Hz` : '无'}
                                </p>
                            </div>
                        </div>

                        {/* 角速度 */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg p-2 bg-gray-700/30 text-center">
                                <p className="text-[10px] text-muted-foreground">肩角速</p>
                                <p className="text-sm font-bold text-purple-400">{bioMetrics.shoulderAngularVel ?? '--'}°/s</p>
                            </div>
                            <div className="rounded-lg p-2 bg-gray-700/30 text-center">
                                <p className="text-[10px] text-muted-foreground">肘角速</p>
                                <p className="text-sm font-bold text-purple-400">{bioMetrics.elbowAngularVel ?? '--'}°/s</p>
                            </div>
                            <div className="rounded-lg p-2 bg-gray-700/30 text-center">
                                <p className="text-[10px] text-muted-foreground">腕角速</p>
                                <p className="text-sm font-bold text-purple-400">{bioMetrics.wristAngularVel ?? '--'}°/s</p>
                            </div>
                        </div>

                        {/* 代偿动作 */}
                        {bioMetrics.compensationType && (
                            <div className="rounded-lg p-2 bg-orange-900/30 border border-orange-800/50 flex items-center gap-2">
                                <span className="text-orange-400 text-lg">⚠️</span>
                                <div>
                                    <p className="text-xs text-orange-300 font-bold">代偿动作</p>
                                    <p className="text-[10px] text-orange-400/70">{bioMetrics.compensationDescription}</p>
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* Action Buttons */}
                {/* 手動標記 Toast */}
                {markToast && (
                    <div className="mb-2 py-2 px-4 rounded-xl bg-amber-600/90 text-white text-sm font-bold text-center animate-fade-in">
                        {markToast}
                    </div>
                )}

                {/* 自動儲存通知 Toast */}
                {autoSaveToast && (
                    <div className="mb-2 py-2 px-4 rounded-xl bg-green-600/90 text-white text-sm font-bold text-center animate-fade-in">
                        {autoSaveToast}
                    </div>
                )}

                {/* 無人畫面提示（一旦偵測到過人體就不再顯示） */}
                {!metrics.subjectLocked && !hasEverLockedRef.current && (
                    <div className="mb-2 py-2 px-4 rounded-xl bg-yellow-600/30 border border-yellow-500/50 text-yellow-300 text-sm font-bold text-center animate-pulse">
                        👤 等待長輩就位... (偵測到人體後自動開始)
                    </div>
                )}

                {/* 自動儲存計數器 */}
                {autoSaveCountRef.current > 0 && (
                    <div className="mb-2 py-1.5 px-3 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center">
                        📊 已自動儲存 {autoSaveCountRef.current} 次投擲
                    </div>
                )}

                {/* 📌 手動標記按鈕 */}
                <button
                    onClick={handleMarkThrow}
                    disabled={saving || saved}
                    className="w-full py-3 mb-2 rounded-xl font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-[0.97] transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <span className="text-xl">📌</span>
                    <span>標記這一球</span>
                    {throwMarkCount > 0 && (
                        <span className="ml-1 bg-card/20 px-2 py-0.5 rounded-full text-xs">{throwMarkCount}</span>
                    )}
                </button>

                <div className="flex gap-3">
                    <button
                        onClick={handleSaveAndStop}
                        disabled={saving || saved}
                        className={`flex-1 py-3 rounded-xl font-bold text-white transition-all ${saved ? 'bg-green-600' :
                            saving ? 'bg-gray-600' :
                                'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600'
                            } disabled:cursor-not-allowed`}
                    >
                        {saved ? '✅ 已結束' : saving ? '結束中...' : '🛑 結束分析'}
                    </button>
                    {/* Sitting Optimization Badge */}
                    <div className="absolute top-16 right-4 bg-gray-900/60 backdrop-blur border border-white/20 rounded-lg px-3 py-1.5 flex flex-col items-end pointer-events-none">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Patent Config</p>
                        <p className="text-xs font-bold text-white flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            🪑 坐姿穩定追蹤 (Seated)
                        </p>
                    </div>

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl font-bold text-muted-foreground bg-gray-800 hover:bg-gray-700 transition-colors"
                        >
                            取消
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
