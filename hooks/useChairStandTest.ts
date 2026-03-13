/**
 * SPPB 椅子起站測試 — 狀態機 Hook
 * 使用 useRef 管理高頻更新避免不必要 re-render
 */
import { useRef, useState, useCallback } from 'react'
import {
    calculateKneeAngle,
    calculateChairStandScore,
    type Landmark3D,
} from '@/utils/sppbMath'

// ============================================================================
// 型別
// ============================================================================

export type TestState = 'IDLE' | 'READY' | 'RISING' | 'STANDING' | 'SITTING_DOWN' | 'FINISHED'

export interface ChairStandResult {
    score: number
    timeSeconds: number
    repCount: number
}

interface UseChairStandTestOptions {
    /** 完成 5 次後觸發 */
    onComplete: (result: ChairStandResult) => void
    /** 所需次數，預設 5 */
    targetReps?: number
    /** 站立角度閾值（度），預設 160 */
    standingThreshold?: number
    /** 坐下角度閾值（度），預設 110 */
    sittingThreshold?: number
}

interface UseChairStandTestReturn {
    /** UI 顯示用：目前次數 */
    repCount: number
    /** UI 顯示用：當前狀態 */
    testState: TestState
    /** UI 顯示用：當前膝關節角度 */
    kneeAngle: number | null
    /** UI 顯示用：經過秒數 */
    elapsedTime: number
    /** 每幀呼叫 */
    processPose: (landmarks: Landmark3D[]) => void
    /** 重置測試 */
    reset: () => void
}

// ============================================================================
// Hook
// ============================================================================

export function useChairStandTest({
    onComplete,
    targetReps = 5,
    standingThreshold = 160,
    sittingThreshold = 110,
}: UseChairStandTestOptions): UseChairStandTestReturn {
    // ---- UI 顯示用 state（低頻更新）----
    const [repCount, setRepCount] = useState(0)
    const [testState, setTestState] = useState<TestState>('IDLE')
    const [kneeAngle, setKneeAngle] = useState<number | null>(null)
    const [elapsedTime, setElapsedTime] = useState(0)

    // ---- 高頻 ref（每幀更新，不觸發 re-render）----
    const stateRef = useRef<TestState>('IDLE')
    const repCountRef = useRef(0)
    const startTimeRef = useRef<number | null>(null)
    const frameCountRef = useRef(0)
    const lastAngleRef = useRef<number | null>(null)

    /** 重置所有狀態 */
    const reset = useCallback(() => {
        stateRef.current = 'IDLE'
        repCountRef.current = 0
        startTimeRef.current = null
        frameCountRef.current = 0
        lastAngleRef.current = null
        setRepCount(0)
        setTestState('IDLE')
        setKneeAngle(null)
        setElapsedTime(0)
    }, [])

    /**
     * 每幀處理 Pose landmarks
     * 狀態流轉：
     *   IDLE → 偵測到人坐著（角度 ≤ sittingThreshold）→ READY
     *   READY → 角度 > sittingThreshold → RISING（開始計時）
     *   RISING → 角度 >= standingThreshold → STANDING
     *   STANDING → 角度 <= sittingThreshold → SITTING_DOWN（次數+1）
     *   SITTING_DOWN → 角度 >= standingThreshold → STANDING
     *   次數達標 → FINISHED
     */
    const processPose = useCallback((landmarks: Landmark3D[]) => {
        if (stateRef.current === 'FINISHED') return

        const angle = calculateKneeAngle(landmarks)
        if (angle === null) return

        lastAngleRef.current = angle
        frameCountRef.current++

        // 每 3 幀更新一次 UI（節約重繪）
        if (frameCountRef.current % 3 === 0) {
            setKneeAngle(Math.round(angle))
            if (startTimeRef.current) {
                setElapsedTime(parseFloat(((Date.now() - startTimeRef.current) / 1000).toFixed(1)))
            }
        }

        const currentState = stateRef.current

        switch (currentState) {
            case 'IDLE': {
                // 等待受試者坐好（膝蓋彎曲）
                if (angle <= sittingThreshold) {
                    stateRef.current = 'READY'
                    setTestState('READY')
                }
                break
            }

            case 'READY': {
                // 受試者開始站起
                if (angle > sittingThreshold) {
                    startTimeRef.current = Date.now()
                    stateRef.current = 'RISING'
                    setTestState('RISING')
                }
                break
            }

            case 'RISING':
            case 'SITTING_DOWN': {
                // 當腿伸直 → 站立
                if (angle >= standingThreshold) {
                    stateRef.current = 'STANDING'
                    setTestState('STANDING')
                }
                break
            }

            case 'STANDING': {
                // 當腿彎曲坐回 → 算一次
                if (angle <= sittingThreshold) {
                    repCountRef.current += 1
                    setRepCount(repCountRef.current)

                    if (repCountRef.current >= targetReps) {
                        // 完成！
                        const totalTime = startTimeRef.current
                            ? (Date.now() - startTimeRef.current) / 1000
                            : 0
                        const score = calculateChairStandScore(totalTime)

                        stateRef.current = 'FINISHED'
                        setTestState('FINISHED')
                        setElapsedTime(parseFloat(totalTime.toFixed(1)))

                        onComplete({
                            score,
                            timeSeconds: parseFloat(totalTime.toFixed(1)),
                            repCount: repCountRef.current,
                        })
                    } else {
                        stateRef.current = 'SITTING_DOWN'
                        setTestState('SITTING_DOWN')
                    }
                }
                break
            }
        }
    }, [onComplete, targetReps, standingThreshold, sittingThreshold])

    return {
        repCount,
        testState,
        kneeAngle,
        elapsedTime,
        processPose,
        reset,
    }
}
