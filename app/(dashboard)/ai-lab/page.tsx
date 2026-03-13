'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

// 動態載入 AI 測試元件（避免 SSR）
const ChairStandCamera = dynamic(() => import('@/components/icope/ChairStandCamera'), { ssr: false })
const BalanceCamera = dynamic(() => import('@/components/icope/BalanceCamera'), { ssr: false })

/** 測試項目設定 */
const AI_TESTS = [
    {
        id: 'chair_stand',
        icon: '🪑',
        title: '椅子起站測試',
        subtitle: 'SPPB Chair Stand Test',
        description: 'AI 自動計算起立坐下 5 次並計時，根據花費的總時間給予 0-4 的臨床評分。',
        color: 'blue',
        features: ['3D 膝關節角度計算', '自動計數 5 次', '臨床標準計分'],
    },
    {
        id: 'balance',
        icon: '⚖️',
        title: '平衡測試',
        subtitle: 'SPPB Balance Test',
        description: '三階段闖關測試：並排站立 → 半並排站立 → 直線站立，每階段維持 10 秒。',
        color: 'purple',
        features: ['足部空間幾何偵測', '防跌倒安全中斷', '肩膀傾斜監測'],
    },
    {
        id: 'posture',
        icon: '🏋️',
        title: '地板滾球姿勢分析',
        subtitle: 'Floor Curling Posture Analysis',
        description: '即時偵測地板滾球投擲姿勢，分析核心穩定性、關節角速度與代償動作。',
        color: 'teal',
        features: ['核心穩定角度', '關節角速度', '震顫偵測'],
    },
]

const COLOR_MAP: Record<string, { bg: string; border: string; hover: string; text: string }> = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/25', hover: 'hover:border-blue-500/50 hover:bg-blue-500/15', text: 'text-blue-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/25', hover: 'hover:border-purple-500/50 hover:bg-purple-500/15', text: 'text-purple-400' },
    teal: { bg: 'bg-teal-500/10', border: 'border-teal-500/25', hover: 'hover:border-teal-500/50 hover:bg-teal-500/15', text: 'text-teal-400' },
}

export default function AiLabPage() {
    const [activeTest, setActiveTest] = useState<string | null>(null)

    // 全螢幕 AI 測試
    if (activeTest === 'chair_stand') {
        return (
            <ChairStandCamera
                assessmentId="ai-lab-demo"
                patientName="測試模式"
                onClose={() => setActiveTest(null)}
            />
        )
    }

    if (activeTest === 'balance') {
        return (
            <BalanceCamera
                assessmentId="ai-lab-demo"
                patientName="測試模式"
                onClose={() => setActiveTest(null)}
            />
        )
    }

    if (activeTest === 'posture') {
        // 地板滾球分析 — 導向既有的分析頁面
        // 這裡用簡易版：開啟後鏡頭 + MediaPipe Pose 即時顯示
        return (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
                <div className="text-center space-y-4 p-6">
                    <p className="text-6xl">🏋️</p>
                    <h2 className="text-2xl font-bold text-white">地板滾球姿勢分析</h2>
                    <p className="text-slate-400 text-sm">
                        請至「地板滾球分析」功能中選擇長者後使用完整分析功能。
                        <br />
                        此處提供的是獨立測試版本。
                    </p>
                    <button
                        onClick={() => setActiveTest(null)}
                        className="px-6 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                    >
                        ← 返回測試區
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">🧪 AI 分析功能測試區</h1>
                <p className="text-sm text-slate-400 mt-1">
                    獨立測試 AI 視覺分析功能，不需對應長者資料，結果不會寫入資料庫
                </p>
            </div>

            {/* 提示 */}
            <div className="glass-card p-4 border-l-4 border-amber-500/50 bg-amber-500/5">
                <div className="flex items-start gap-3">
                    <span className="text-lg">💡</span>
                    <div>
                        <p className="text-sm text-amber-400 font-medium">測試模式說明</p>
                        <p className="text-xs text-slate-500 mt-1">
                            此區域僅供功能驗證與演示使用。測試結果不會儲存至資料庫，也不會關聯任何長者的評估紀錄。
                            請確保手機已架設妥當，並使用後鏡頭進行偵測。
                        </p>
                    </div>
                </div>
            </div>

            {/* 測試項目 */}
            <div className="space-y-4">
                {AI_TESTS.map(test => {
                    const colors = COLOR_MAP[test.color]
                    return (
                        <button
                            key={test.id}
                            onClick={() => setActiveTest(test.id)}
                            className={`w-full text-left p-5 rounded-2xl border-2 transition-all group ${colors.bg} ${colors.border} ${colors.hover}`}
                        >
                            <div className="flex items-start gap-4">
                                <span className="text-4xl">{test.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className={`text-lg font-bold text-white group-hover:${colors.text} transition-colors`}>
                                            {test.title}
                                        </h3>
                                        <span className="text-xs text-slate-600">{test.subtitle}</span>
                                    </div>
                                    <p className="text-sm text-slate-400 mb-3">{test.description}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {test.features.map((f, i) => (
                                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500">
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <span className={`text-2xl text-slate-700 group-hover:${colors.text} transition-colors`}>→</span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
