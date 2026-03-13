/**
 * 個案追蹤/後測時間推算邏輯 — 獨立 TypeScript 函式
 * 依公衛規範：初評 +1 個月追蹤、+3~6 個月後測
 */

// ============================================================================
// 追蹤狀態
// ============================================================================

export type FollowUpStatus = 'not_due' | 'completed' | 'overdue'

export interface FollowUpResult {
    status: FollowUpStatus
    label: string
    icon: string
    color: string
    dueDate: Date
}

/**
 * 計算追蹤狀態
 * @param assessedAt 初評日期
 * @param followUpCompleted 是否已完成追蹤
 */
export function getFollowUpStatus(assessedAt: string | Date, followUpCompleted: boolean): FollowUpResult {
    const baseDate = new Date(assessedAt)
    const now = new Date()
    const dueDate = new Date(baseDate)
    dueDate.setMonth(dueDate.getMonth() + 1)

    if (followUpCompleted) {
        return { status: 'completed', label: '已追蹤', icon: '🟢', color: 'text-emerald-400', dueDate }
    }

    if (now > dueDate) {
        return { status: 'overdue', label: '逾期未追蹤', icon: '🔴', color: 'text-red-400', dueDate }
    }

    return { status: 'not_due', label: '追蹤未到期', icon: '⚪', color: 'text-slate-400', dueDate }
}

// ============================================================================
// 後測狀態
// ============================================================================

export type PostTestStatus = 'not_due' | 'available' | 'overdue' | 'completed'

export interface PostTestResult {
    status: PostTestStatus
    label: string
    icon: string
    color: string
    windowStart: Date
    windowEnd: Date
    canStart: boolean
}

/**
 * 計算後測狀態
 * @param assessedAt 初評日期
 * @param postTestCompleted 是否已完成後測
 */
export function getPostTestStatus(assessedAt: string | Date, postTestCompleted: boolean): PostTestResult {
    const baseDate = new Date(assessedAt)
    const now = new Date()

    const windowStart = new Date(baseDate)
    windowStart.setMonth(windowStart.getMonth() + 3)

    const windowEnd = new Date(baseDate)
    windowEnd.setMonth(windowEnd.getMonth() + 6)

    if (postTestCompleted) {
        return { status: 'completed', label: '後測已完成', icon: '🟢', color: 'text-emerald-400', windowStart, windowEnd, canStart: false }
    }

    if (now < windowStart) {
        const daysLeft = Math.ceil((windowStart.getTime() - now.getTime()) / 86400000)
        return { status: 'not_due', label: `後測未到期（${daysLeft} 天後）`, icon: '⚪', color: 'text-slate-400', windowStart, windowEnd, canStart: false }
    }

    if (now >= windowStart && now <= windowEnd) {
        const daysLeft = Math.ceil((windowEnd.getTime() - now.getTime()) / 86400000)
        return { status: 'available', label: `可進行後測（剩 ${daysLeft} 天）`, icon: '🟡', color: 'text-amber-400', windowStart, windowEnd, canStart: true }
    }

    return { status: 'overdue', label: '後測已逾期', icon: '⚫', color: 'text-slate-600', windowStart, windowEnd, canStart: false }
}

// ============================================================================
// 後測項目過濾（排除視力與聽力）
// ============================================================================

export type PrimaryDomainKey = 'cognition' | 'mobility' | 'nutrition' | 'vision' | 'hearing' | 'depression'

/** 初評面向 → 後測量表映射（排除視力與聽力） */
const DOMAIN_TO_TASK: Partial<Record<PrimaryDomainKey, string>> = {
    cognition: 'AD8',
    mobility: 'SPPB',
    nutrition: 'MNA-SF',
    depression: 'GDS-15',
}

/**
 * 根據初評異常面向產生後測任務清單（排除視力與聽力）
 */
export function getPostTestTasks(primary: Record<PrimaryDomainKey, boolean>): string[] {
    const tasks: string[] = []
    const domains = Object.keys(DOMAIN_TO_TASK) as PrimaryDomainKey[]

    for (const d of domains) {
        if (primary[d] && DOMAIN_TO_TASK[d]) {
            tasks.push(DOMAIN_TO_TASK[d]!)
        }
    }

    // 若任一項異常 → 加入用藥與社會照護
    if (tasks.length > 0) {
        tasks.push('Meds', 'Social')
    }

    return tasks
}

/**
 * 計算初評異常數
 */
export function countAbnormalDomains(primary: Record<string, boolean>): number {
    const keys: PrimaryDomainKey[] = ['cognition', 'mobility', 'nutrition', 'vision', 'hearing', 'depression']
    return keys.filter(k => primary[k]).length
}
