/**
 * SPPB 椅子起站測試 — 純函數與演算法層
 * 3D 膝關節角度計算 + 臨床計分
 */

// ============================================================================
// 型別
// ============================================================================

/** MediaPipe Pose Landmark 3D 座標 */
export interface Landmark3D {
    x: number
    y: number
    z: number
    visibility?: number
}

/** 3D 向量 */
interface Vector3 {
    x: number
    y: number
    z: number
}

// ============================================================================
// MediaPipe Landmark Index 常數
// ============================================================================

/** 右側髖關節 */
export const HIP_INDEX = 24
/** 右側膝關節 */
export const KNEE_INDEX = 26
/** 右側踝關節 */
export const ANKLE_INDEX = 28

// ============================================================================
// 向量運算
// ============================================================================

/** 建立從 A 指向 B 的向量 */
function vectorFromTo(a: Landmark3D, b: Landmark3D): Vector3 {
    return {
        x: b.x - a.x,
        y: b.y - a.y,
        z: b.z - a.z,
    }
}

/** 向量點積 */
function dot(u: Vector3, v: Vector3): number {
    return u.x * v.x + u.y * v.y + u.z * v.z
}

/** 向量模長 */
function magnitude(v: Vector3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

// ============================================================================
// 核心函式
// ============================================================================

/**
 * 計算膝關節的 3D 真實夾角（度）
 *
 * 使用 3D 空間向量點積與反餘弦公式：
 * angle = acos( (vec_hip·vec_ankle) / (|vec_hip|·|vec_ankle|) )
 *
 * @param landmarks MediaPipe Pose landmarks 陣列
 * @returns 膝關節夾角（0-180 度），若偵測不到則回傳 null
 */
export function calculateKneeAngle(landmarks: Landmark3D[]): number | null {
    if (!landmarks || landmarks.length < ANKLE_INDEX + 1) return null

    const hip = landmarks[HIP_INDEX]
    const knee = landmarks[KNEE_INDEX]
    const ankle = landmarks[ANKLE_INDEX]

    // 確認可見度足夠（> 0.5）
    const minVisibility = 0.5
    if (
        (hip.visibility !== undefined && hip.visibility < minVisibility) ||
        (knee.visibility !== undefined && knee.visibility < minVisibility) ||
        (ankle.visibility !== undefined && ankle.visibility < minVisibility)
    ) {
        return null
    }

    // 建立向量：膝 → 髖、膝 → 踝
    const vecKneeToHip = vectorFromTo(knee, hip)
    const vecKneeToAnkle = vectorFromTo(knee, ankle)

    const magA = magnitude(vecKneeToHip)
    const magB = magnitude(vecKneeToAnkle)

    if (magA === 0 || magB === 0) return null

    // 點積 → 夾角
    const cosAngle = dot(vecKneeToHip, vecKneeToAnkle) / (magA * magB)
    // 限制 cosAngle 在 [-1, 1] 避免浮點誤差
    const clampedCos = Math.max(-1, Math.min(1, cosAngle))
    const angleRad = Math.acos(clampedCos)
    const angleDeg = (angleRad * 180) / Math.PI

    return angleDeg
}

/**
 * 依據臨床標準計算椅子起站分數 (0-4)
 *
 * - < 11.20 秒 → 4 分
 * - 11.20 ~ 13.69 秒 → 3 分
 * - 13.70 ~ 16.69 秒 → 2 分
 * - 16.70 ~ 59.99 秒 → 1 分
 * - ≥ 60 秒 或無法完成 → 0 分
 *
 * @param seconds 完成 5 次起坐所需秒數，null 表示無法完成
 */
export function calculateChairStandScore(seconds: number | null): number {
    if (seconds === null || seconds < 0) return 0
    if (seconds >= 60) return 0
    if (seconds >= 16.70) return 1
    if (seconds >= 13.70) return 2
    if (seconds >= 11.20) return 3
    return 4
}

/**
 * 取得分數對應的判定文字與顏色
 */
export function getChairStandVerdict(score: number): { label: string; color: string } {
    if (score >= 4) return { label: '表現優秀', color: 'text-emerald-400' }
    if (score >= 3) return { label: '表現良好', color: 'text-green-400' }
    if (score >= 2) return { label: '輕微障礙', color: 'text-amber-400' }
    if (score >= 1) return { label: '中度障礙', color: 'text-orange-400' }
    return { label: '重度障礙', color: 'text-red-400' }
}
