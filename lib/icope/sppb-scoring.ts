/**
 * SPPB 計分邏輯 — 獨立 TypeScript 函式
 * 抽離自元件，便於單元測試
 */

// ============================================================================
// 平衡測試計分 (0-4 分)
// ============================================================================

export type BalancePosition = 'side_by_side' | 'semi_tandem' | 'tandem'

export interface BalanceResult {
    /** 並排站立能否維持 10 秒 */
    sideBySide: boolean
    /** 半並排站立能否維持 10 秒 */
    semiTandem: boolean
    /** 直線站立維持秒數 (0-10) */
    tandemSeconds: number
}

/**
 * 計算平衡測試分數 (0-4)
 * - 並排站立 < 10 秒 → 0 分
 * - 並排站立 ≥ 10 秒，半並排 < 10 秒 → 1 分
 * - 半並排 ≥ 10 秒，直線 < 3 秒 → 2 分
 * - 直線 3-9.99 秒 → 3 分
 * - 直線 ≥ 10 秒 → 4 分
 */
export function calculateBalanceScore(result: BalanceResult): number {
    if (!result.sideBySide) return 0
    if (!result.semiTandem) return 1
    if (result.tandemSeconds < 3) return 2
    if (result.tandemSeconds < 10) return 3
    return 4
}

// ============================================================================
// 步行速度測試計分 (0-4 分)
// ============================================================================

/**
 * 計算步行速度測試分數 (0-4)
 * @param seconds 完成步行所需秒數
 * @param distance 測試距離（3 或 4 公尺）
 */
export function calculateGaitScore(seconds: number | null, distance: 3 | 4): number {
    if (seconds === null || seconds <= 0) return 0

    if (distance === 4) {
        // 4 公尺標準
        if (seconds > 8.70) return 1
        if (seconds >= 6.21) return 2
        if (seconds >= 4.82) return 3
        return 4 // < 4.82 秒
    } else {
        // 3 公尺標準（按比例換算）
        if (seconds > 6.52) return 1
        if (seconds >= 4.66) return 2
        if (seconds >= 3.62) return 3
        return 4 // < 3.62 秒
    }
}

// ============================================================================
// 椅子起站測試計分 (0-4 分)
// ============================================================================

/**
 * 計算椅子起站測試分數 (0-4)
 * @param seconds 完成 5 次起坐所需秒數，null 表示無法完成
 */
export function calculateChairScore(seconds: number | null): number {
    if (seconds === null || seconds <= 0) return 0
    if (seconds > 16.69) return 1
    if (seconds >= 13.70) return 2
    if (seconds >= 11.20) return 3
    return 4 // < 11.20 秒
}

// ============================================================================
// SPPB 總分
// ============================================================================

export interface SppbScores {
    balance: number
    gait: number
    chair: number
}

/**
 * 計算 SPPB 總分 (0-12)
 */
export function calculateSppbTotal(scores: SppbScores): number {
    return scores.balance + scores.gait + scores.chair
}

/**
 * 判定 SPPB 結果
 * - 10-12 分：行動能力正常
 * - 7-9 分：輕度行動障礙
 * - 4-6 分：中度行動障礙
 * - 0-3 分：重度行動障礙
 */
export function getSppbVerdict(total: number): { label: string; severity: 'normal' | 'mild' | 'moderate' | 'severe'; color: string } {
    if (total >= 10) return { label: '行動能力正常', severity: 'normal', color: 'text-emerald-400' }
    if (total >= 7) return { label: '輕度行動障礙', severity: 'mild', color: 'text-amber-400' }
    if (total >= 4) return { label: '中度行動障礙', severity: 'moderate', color: 'text-orange-400' }
    return { label: '重度行動障礙', severity: 'severe', color: 'text-red-400' }
}
