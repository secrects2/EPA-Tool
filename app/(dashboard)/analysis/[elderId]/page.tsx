'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { BiomechanicsEngine, BiomechanicsMetrics, LANDMARKS } from '@/lib/analysis/biomechanics-engine'
import { logActivity } from '@/lib/activity-log'

type TestType = 'pre' | 'post' | 'practice'

export default function AnalysisPage() {
    const params = useParams()
    const router = useRouter()
    const elderId = params.elderId as string

    const [elderName, setElderName] = useState('')
    const [testType, setTestType] = useState<TestType>('practice')
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [metrics, setMetrics] = useState<BiomechanicsMetrics | null>(null)
    const [throwMarks, setThrowMarks] = useState<BiomechanicsMetrics[]>([])
    const [sessionStart, setSessionStart] = useState<number>(0)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [subjectLocked, setSubjectLocked] = useState(false)
    const [saving, setSaving] = useState(false)

    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const engineRef = useRef<BiomechanicsEngine | null>(null)
    const animFrameRef = useRef<number>(0)
    const poseRef = useRef<any>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const metricsHistoryRef = useRef<BiomechanicsMetrics[]>([])
    const lastMarkTimeRef = useRef<number>(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // 取得長輩名稱
    useEffect(() => {
        const fetchElder = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('elders').select('name').eq('id', elderId).single()
            if (data) setElderName(data.name)
        }
        fetchElder()
    }, [elderId])

    // 初始化分析引擎
    const startAnalysis = useCallback(async () => {
        try {
            // 取得攝影機
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                await videoRef.current.play()
            }

            // 初始化引擎
            engineRef.current = new BiomechanicsEngine()

            // 載入 MediaPipe Pose
            const { Pose } = await import('@mediapipe/pose')
            const pose = new Pose({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
            })

            pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            })

            pose.onResults((results: any) => {
                if (!results.poseLandmarks || !engineRef.current) return

                const landmarks = results.poseLandmarks
                const video = videoRef.current
                if (!video) return

                // 骨架可見性檢查
                const rShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER]
                const rElbow = landmarks[LANDMARKS.RIGHT_ELBOW]
                const rWrist = landmarks[LANDMARKS.RIGHT_WRIST]
                const lShoulder = landmarks[LANDMARKS.LEFT_SHOULDER]
                const lHip = landmarks[LANDMARKS.LEFT_HIP]
                const rHip = landmarks[LANDMARKS.RIGHT_HIP]

                const armVisible = Math.min(rShoulder?.visibility || 0, rElbow?.visibility || 0, rWrist?.visibility || 0) > 0.5
                const shouldersVisible = (lShoulder?.visibility || 0) > 0.5
                const hipVisible = Math.max(lHip?.visibility || 0, rHip?.visibility || 0) > 0.5

                if (!armVisible || !shouldersVisible || !hipVisible) {
                    setSubjectLocked(false)
                    return
                }

                setSubjectLocked(true)

                // 處理幀數據
                const frameMetrics = engineRef.current.processFrame(
                    landmarks,
                    video.videoWidth || 640,
                    video.videoHeight || 480,
                    performance.now()
                )

                // 計算基礎指標 (ROM, 軀幹穩定性, 速度)
                const zWeight = 0.2
                const calcAngle = (a: any, b: any, c: any) => {
                    const ba = { x: a.x - b.x, y: a.y - b.y, z: ((a.z || 0) - (b.z || 0)) * zWeight }
                    const bc = { x: c.x - b.x, y: c.y - b.y, z: ((c.z || 0) - (b.z || 0)) * zWeight }
                    const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z
                    const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2)
                    const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2)
                    if (magBA === 0 || magBC === 0) return 0
                    return Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC)))) * (180 / Math.PI)
                }

                // 肘關節 ROM
                const rawROM = calcAngle(rShoulder, rElbow, rWrist)
                const filteredROM = engineRef.current.applyFilter('elbowROM', rawROM)
                frameMetrics.elbowROM = Math.round(filteredROM * 10) / 10
                frameMetrics.elbowROM_raw = Math.round(rawROM * 10) / 10

                metricsHistoryRef.current.push(frameMetrics)
                setMetrics({ ...frameMetrics })

                // 繪製骨架到 Canvas
                drawSkeleton(landmarks, results)
            })

            poseRef.current = pose
            setIsAnalyzing(true)
            setSessionStart(Date.now())
            metricsHistoryRef.current = []
            setThrowMarks([])
            setElapsedSeconds(0)

            // 計時器
            timerRef.current = setInterval(() => {
                setElapsedSeconds(prev => prev + 1)
            }, 1000)

            // 開始幀循環
            const processFrame = async () => {
                if (videoRef.current && poseRef.current && videoRef.current.readyState >= 2) {
                    await poseRef.current.send({ image: videoRef.current })
                }
                animFrameRef.current = requestAnimationFrame(processFrame)
            }
            processFrame()

            toast.success('分析已啟動')
            logActivity('開始 AI 分析', `長輩: ${elderName}, 類型: ${testType}`, 'analysis', elderId)
        } catch (err: any) {
            toast.error('無法啟動攝影機: ' + (err.message || '未知錯誤'))
        }
    }, [])

    // 繪製骨架
    const drawSkeleton = (landmarks: any[], results: any) => {
        const canvas = canvasRef.current
        const video = videoRef.current
        if (!canvas || !video) return

        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 480
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // 繪製連接線
        const connections = [
            [11, 13], [13, 15], [12, 14], [14, 16],
            [11, 12], [11, 23], [12, 24], [23, 24],
            [23, 25], [24, 26],
        ]
        ctx.strokeStyle = 'rgba(12, 147, 231, 0.7)'
        ctx.lineWidth = 2
        for (const [a, b] of connections) {
            if (landmarks[a]?.visibility > 0.3 && landmarks[b]?.visibility > 0.3) {
                ctx.beginPath()
                ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height)
                ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height)
                ctx.stroke()
            }
        }

        // 繪製關節點
        for (let i = 0; i < landmarks.length; i++) {
            if (landmarks[i]?.visibility > 0.3) {
                ctx.beginPath()
                ctx.arc(landmarks[i].x * canvas.width, landmarks[i].y * canvas.height, 4, 0, 2 * Math.PI)
                ctx.fillStyle = 'rgba(249, 115, 22, 0.9)'
                ctx.fill()
            }
        }
    }

    // 手動標記投球
    const markThrow = () => {
        const now = Date.now()
        if (now - lastMarkTimeRef.current < 1000) {
            toast('冷卻中，請稍候', { icon: '⏳' })
            return
        }
        lastMarkTimeRef.current = now
        if (metrics) {
            setThrowMarks(prev => [...prev, { ...metrics }])
            toast.success(`📌 已標記第 ${throwMarks.length + 1} 次投球`)
        }
    }

    // 停止分析並儲存
    const stopAndSave = async () => {
        // 停止幀循環
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        if (timerRef.current) clearInterval(timerRef.current)

        // 停止攝影機
        streamRef.current?.getTracks().forEach(track => track.stop())
        if (poseRef.current) poseRef.current.close()

        setIsAnalyzing(false)
        setSaving(true)

        // 計算會話平均值
        const history = metricsHistoryRef.current
        if (history.length === 0) {
            toast.error('無數據可儲存')
            setSaving(false)
            return
        }

        const avg = (arr: (number | null)[]) => {
            const valid = arr.filter((v): v is number => v !== null && !isNaN(v))
            return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
        }

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setSaving(false); return }

        const { error } = await supabase.from('analysis_sessions').insert({
            elder_id: elderId,
            instructor_id: user.id,
            test_type: testType,
            avg_elbow_rom: avg(history.map(h => h.elbowROM)),
            avg_shoulder_rom: avg(history.map(h => h.shoulderAngularVel)),
            avg_trunk_tilt: avg(history.map(h => h.trunkStability)),
            avg_core_stability: avg(history.map(h => h.coreStabilityAngle)),
            avg_shoulder_velocity: avg(history.map(h => h.shoulderAngularVel)),
            avg_elbow_velocity: avg(history.map(h => h.elbowAngularVel)),
            avg_wrist_velocity: avg(history.map(h => h.wristAngularVel)),
            tremor_detected: history.some(h => h.tremorDetected),
            tremor_severity: history.find(h => h.tremorDetected)?.tremorSeverity || null,
            compensation_detected: history.some(h => h.compensationType !== null),
            compensation_type: history.find(h => h.compensationType !== null)?.compensationType || null,
            posture_status: history.some(h => h.isHunched) ? '駝背' : history.some(h => h.isTilted) ? '歪斜' : '正常',
            duration_seconds: elapsedSeconds,
            raw_metrics: { frame_count: history.length, throw_marks: throwMarks },
        })

        if (error) {
            toast.error('儲存失敗: ' + error.message)
        } else {
            toast.success('分析數據已儲存！')
            logActivity('儲存分析結果', `長輩: ${elderName}, 類型: ${testType}, 時長: ${elapsedSeconds}秒`, 'session', elderId)
            router.push(`/elders/${elderId}`)
        }
        setSaving(false)
    }

    // 清理
    useEffect(() => {
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
            if (timerRef.current) clearInterval(timerRef.current)
            streamRef.current?.getTracks().forEach(track => track.stop())
        }
    }, [])

    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push(`/elders/${elderId}`)} className="text-slate-400 hover:text-white transition-colors text-sm">
                        ← 返回
                    </button>
                    <h1 className="text-xl font-bold text-white">🤖 AI 分析 - {elderName}</h1>
                </div>
                {!isAnalyzing && (
                    <div className="flex items-center gap-3">
                        <select
                            value={testType}
                            onChange={e => setTestType(e.target.value as TestType)}
                            className="px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm focus:border-primary-500 focus:outline-none"
                        >
                            <option value="practice" className="bg-slate-800 text-white">練習</option>
                            <option value="pre" className="bg-slate-800 text-white">前測</option>
                            <option value="post" className="bg-slate-800 text-white">後測</option>
                        </select>
                        <button onClick={startAnalysis} className="btn-accent text-sm">
                            🎬 開始分析
                        </button>
                    </div>
                )}
            </div>

            {/* Video + Canvas */}
            <div className="relative glass-card overflow-hidden" style={{ minHeight: '45vh' }}>
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

                {!isAnalyzing && !metrics && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                        <div className="text-center">
                            <p className="text-5xl mb-4">🎯</p>
                            <p className="text-white font-medium">選擇測試類型後點擊「開始分析」</p>
                            <p className="text-sm text-slate-400 mt-1">請確保攝影機可拍攝到人體上半身</p>
                        </div>
                    </div>
                )}

                {/* Status indicators */}
                {isAnalyzing && (
                    <>
                        <div className="absolute top-3 left-3 flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${subjectLocked ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                            <span className="text-xs text-white bg-black/50 px-2 py-1 rounded-lg">
                                {subjectLocked ? '🎯 目標鎖定' : '⏳ 等待偵測...'}
                            </span>
                        </div>
                        <div className="absolute top-3 right-3 flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-1 rounded-lg ${testType === 'pre' ? 'bg-amber-500/80 text-white' :
                                testType === 'post' ? 'bg-emerald-500/80 text-white' :
                                    'bg-slate-500/80 text-white'
                                }`}>
                                {testType === 'pre' ? '前測' : testType === 'post' ? '後測' : '練習'}
                            </span>
                            <span className="text-xs text-white bg-black/50 px-2 py-1 rounded-lg font-mono">
                                ⏱ {formatTime(elapsedSeconds)}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Action buttons */}
            {isAnalyzing && (
                <div className="flex gap-3">
                    <button onClick={markThrow} className="flex-1 btn-accent text-base py-4">
                        📌 標記投球 ({throwMarks.length})
                    </button>
                    <button onClick={stopAndSave} disabled={saving} className="flex-1 py-4 rounded-xl font-semibold text-white bg-slate-600 hover:bg-slate-500 transition-colors disabled:opacity-50">
                        {saving ? '儲存中...' : '🛑 結束分析'}
                    </button>
                </div>
            )}

            {/* Real-time metrics HUD */}
            {isAnalyzing && metrics && (
                <div className="glass-card p-4 max-h-[40vh] overflow-y-auto">
                    <h3 className="text-white font-semibold mb-3 text-sm">📊 即時指標</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">肘 ROM</p>
                            <p className="text-lg font-bold text-white">{metrics.elbowROM?.toFixed(1) ?? '--'}°</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">核心穩定性</p>
                            <p className={`text-lg font-bold ${(metrics.coreStabilityAngle ?? 0) <= 5 ? 'text-emerald-400' : (metrics.coreStabilityAngle ?? 0) <= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                                {metrics.coreStabilityAngle?.toFixed(1) ?? '--'}°
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">肩速度</p>
                            <p className="text-lg font-bold text-white">{metrics.shoulderAngularVel?.toFixed(1) ?? '--'}°/s</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">肘速度</p>
                            <p className="text-lg font-bold text-white">{metrics.elbowAngularVel?.toFixed(1) ?? '--'}°/s</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">震顫</p>
                            <p className={`text-lg font-bold ${metrics.tremorDetected ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {metrics.tremorDetected ? `${metrics.tremorSeverity}` : '無'}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">代償</p>
                            <p className={`text-lg font-bold ${metrics.compensationType ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {metrics.compensationDescription || '正常'}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">姿勢</p>
                            <p className={`text-lg font-bold ${metrics.isHunched || metrics.isTilted ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {metrics.isHunched ? '駝背' : metrics.isTilted ? '歪斜' : '正常'}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5">
                            <p className="text-xs text-slate-500">鎖定信心</p>
                            <p className="text-lg font-bold text-white">{(metrics.subjectConfidence * 100).toFixed(0)}%</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
