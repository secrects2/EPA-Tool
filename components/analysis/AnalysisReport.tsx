'use client'

import React from 'react'
import { type AiReport, type AnalysisMetrics, generateAiReport } from '@/lib/analysis/ai-prescription'

// ============================================================================
// Props
// ============================================================================

interface AnalysisReportProps {
    metrics: AnalysisMetrics
    patientName?: string
    sessionDate?: string
    durationSeconds?: number
    onClose: () => void
}

// ============================================================================
// Helpers
// ============================================================================

const PRIORITY_STYLES = {
    high: { bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'bg-red-500', label: '高' },
    medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', badge: 'bg-amber-500', label: '中' },
    low: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', badge: 'bg-blue-500', label: '低' },
}

function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

// ============================================================================
// SVG Charts
// ============================================================================

/** 雷達圖 - 五維能力評估 */
function RadarChart({ metrics }: { metrics: AnalysisMetrics }) {
    const size = 200
    const cx = size / 2
    const cy = size / 2
    const maxR = 75

    // 五個維度（0~100 正規化）
    const dims = [
        { label: '伸展度', value: Math.min(metrics.avg_rom / 180 * 100, 100) },
        { label: '穩定性', value: Math.max(0, 100 - (metrics.avg_trunk_tilt * 4)) },
        { label: '協調性', value: Math.max(0, 100 - metrics.compensation_detected_ratio) },
        { label: '手控制', value: Math.max(0, 100 - metrics.tremor_detected_ratio * 2) },
        { label: '一致性', value: metrics.stable_ratio },
    ]
    const n = dims.length

    const getPoint = (i: number, r: number) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    }

    const gridLevels = [0.25, 0.5, 0.75, 1]
    const dataPoints = dims.map((d, i) => getPoint(i, (d.value / 100) * maxR))
    const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'

    return (
        <div className="flex flex-col items-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* 網格 */}
                {gridLevels.map(level => {
                    const pts = Array.from({ length: n }, (_, i) => getPoint(i, maxR * level))
                    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'
                    return <path key={level} d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                })}
                {/* 軸線 */}
                {dims.map((_, i) => {
                    const p = getPoint(i, maxR)
                    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                })}
                {/* 數據區域 */}
                <path d={dataPath} fill="rgba(59,130,246,0.25)" stroke="rgb(59,130,246)" strokeWidth={2} />
                {dataPoints.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#3B82F6" stroke="#1E3A5F" strokeWidth={1.5} />
                ))}
                {/* 標籤 */}
                {dims.map((d, i) => {
                    const lp = getPoint(i, maxR + 20)
                    return (
                        <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
                            className="fill-slate-400 text-[10px]">{d.label}</text>
                    )
                })}
            </svg>
        </div>
    )
}

/** 柱狀圖 - 各指標與理想值對比 */
function BarChart({ metrics }: { metrics: AnalysisMetrics }) {
    const bars = [
        { label: 'ROM', value: metrics.avg_rom, ideal: 160, unit: '°', color: '#3B82F6' },
        { label: '穩定率', value: metrics.stable_ratio, ideal: 80, unit: '%', color: '#10B981' },
        { label: '軀幹', value: Math.max(0, 100 - metrics.avg_trunk_tilt * 4), ideal: 80, unit: '', color: '#8B5CF6' },
        { label: '手控制', value: Math.max(0, 100 - metrics.tremor_detected_ratio * 2), ideal: 90, unit: '', color: '#F59E0B' },
    ]

    return (
        <div className="space-y-3">
            {bars.map((bar, i) => {
                const normalized = Math.min((bar.value / bar.ideal) * 100, 120)
                const isGood = bar.value >= bar.ideal * 0.8
                return (
                    <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-400">{bar.label}</span>
                            <span className={isGood ? 'text-emerald-400' : 'text-amber-400'}>
                                {bar.label === 'ROM' ? `${metrics.avg_rom}${bar.unit}` :
                                    bar.label === '穩定率' ? `${metrics.stable_ratio}${bar.unit}` :
                                        `${Math.round(bar.value)}`}
                            </span>
                        </div>
                        <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
                            {/* 理想值標記線 */}
                            <div className="absolute top-0 bottom-0 w-px bg-white/20"
                                style={{ left: `${Math.min((bar.ideal / (bar.ideal * 1.2)) * 100, 100)}%` }} />
                            {/* 實際值 */}
                            <div className="h-full rounded-full transition-all duration-700"
                                style={{
                                    width: `${Math.min(normalized / 1.2, 100)}%`,
                                    backgroundColor: bar.color,
                                    opacity: isGood ? 1 : 0.7,
                                }}
                            />
                        </div>
                    </div>
                )
            })}
            <p className="text-[9px] text-slate-600 text-center mt-1">白色標記線 = 理想值</p>
        </div>
    )
}

/** 圓餅圖 - 動作品質分布 */
function DonutChart({ metrics }: { metrics: AnalysisMetrics }) {
    const stable = metrics.stable_ratio
    const tremor = metrics.tremor_detected_ratio
    const comp = metrics.compensation_detected_ratio
    const normal = Math.max(0, 100 - stable) // unstable portion not covered by tremor/comp

    const segments = [
        { label: '穩定動作', value: stable, color: '#10B981' },
        { label: '震顫影響', value: tremor, color: '#F59E0B' },
        { label: '代償動作', value: comp, color: '#EF4444' },
        { label: '其他不穩定', value: Math.max(0, normal - tremor - comp), color: '#6B7280' },
    ].filter(s => s.value > 0)

    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
    const r = 60
    const cx = 80
    const cy = 80
    let cumAngle = -90

    return (
        <div className="flex items-center gap-4">
            <svg width={160} height={160} viewBox="0 0 160 160">
                {segments.map((seg, i) => {
                    const angle = (seg.value / total) * 360
                    const startAngle = cumAngle
                    cumAngle += angle
                    const endAngle = cumAngle

                    const startRad = (startAngle * Math.PI) / 180
                    const endRad = (endAngle * Math.PI) / 180
                    const x1 = cx + r * Math.cos(startRad)
                    const y1 = cy + r * Math.sin(startRad)
                    const x2 = cx + r * Math.cos(endRad)
                    const y2 = cy + r * Math.sin(endRad)
                    const largeArc = angle > 180 ? 1 : 0

                    return (
                        <path key={i}
                            d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`}
                            fill={seg.color} opacity={0.85} stroke="rgba(15,23,42,0.5)" strokeWidth={1.5}
                        />
                    )
                })}
                {/* 中心空洞 */}
                <circle cx={cx} cy={cy} r={35} fill="rgb(15,23,42)" />
                <text x={cx} y={cy - 6} textAnchor="middle" className="fill-white text-base font-bold">{stable}%</text>
                <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-500 text-[9px]">穩定率</text>
            </svg>
            <div className="space-y-2 text-xs">
                {segments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                        <span className="text-slate-400">{seg.label}</span>
                        <span className="text-white font-medium ml-auto">{seg.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ============================================================================
// 健康風險推論
// ============================================================================

function HealthInferences({ metrics }: { metrics: AnalysisMetrics }) {
    const inferences: { icon: string; condition: string; evidence: string; risk: 'low' | 'medium' | 'high'; color: string }[] = []

    if (metrics.avg_rom < 120) {
        inferences.push({ icon: '🦴', condition: '肩關節活動受限 / 五十肩風險', evidence: `ROM ${metrics.avg_rom}° 低於正常範圍（>140°）`, risk: 'high', color: '#EF4444' })
    } else if (metrics.avg_rom < 150) {
        inferences.push({ icon: '🦴', condition: '上肢柔軟度下降', evidence: `ROM ${metrics.avg_rom}°，略低於理想值`, risk: 'medium', color: '#F59E0B' })
    }

    if (metrics.avg_trunk_tilt > 20) {
        inferences.push({ icon: '🏥', condition: '脊椎側彎 / 核心肌群弱化', evidence: `軀幹傾斜 ${metrics.avg_trunk_tilt}° 明顯偏高`, risk: 'high', color: '#EF4444' })
    } else if (metrics.avg_trunk_tilt > 12) {
        inferences.push({ icon: '🏥', condition: '核心穩定性不足', evidence: `軀幹傾斜 ${metrics.avg_trunk_tilt}°`, risk: 'medium', color: '#F59E0B' })
    }

    if (metrics.tremor_detected_ratio > 20) {
        inferences.push({ icon: '🧠', condition: '神經肌肉控制異常 / 帕金森氏症風險', evidence: `震顫偵測率 ${metrics.tremor_detected_ratio}%，建議進一步神經科檢查`, risk: 'high', color: '#EF4444' })
    } else if (metrics.tremor_detected_ratio > 10) {
        inferences.push({ icon: '🧠', condition: '輕微手部震顫', evidence: `震顫偵測率 ${metrics.tremor_detected_ratio}%`, risk: 'medium', color: '#F59E0B' })
    }

    if (metrics.compensation_detected_ratio > 30) {
        inferences.push({ icon: '⚕️', condition: '動作代償模式 / 肌力不平衡', evidence: `代償頻率 ${metrics.compensation_detected_ratio}%，可能存在疼痛迴避行為`, risk: 'high', color: '#EF4444' })
    }

    if (inferences.length === 0) {
        inferences.push({ icon: '✅', condition: '各項指標正常', evidence: '未偵測到明顯風險因子', risk: 'low', color: '#10B981' })
    }

    const riskLabels = { low: '低風險', medium: '中風險', high: '高風險' }

    return (
        <div className="space-y-3">
            {inferences.map((inf, i) => (
                <div key={i} className="rounded-xl border border-white/10 p-3 flex items-start gap-3">
                    <span className="text-xl mt-0.5">{inf.icon}</span>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{inf.condition}</h4>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: inf.color }}>
                                {riskLabels[inf.risk]}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{inf.evidence}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ============================================================================
// Main Component
// ============================================================================

export default function AnalysisReport({ metrics, patientName, sessionDate, durationSeconds, onClose }: AnalysisReportProps) {
    const report: AiReport = generateAiReport(metrics)
    const now = sessionDate || new Date().toLocaleString('zh-TW')

    return (
        <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-lg border-b border-white/5 px-4 py-3 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-white">📊 AI 健康分析報告</h1>
                    <p className="text-xs text-slate-500">{patientName || '長者'} · {now}</p>
                </div>
                <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white hover:bg-white/20 transition-colors">
                    ✕ 關閉
                </button>
            </div>

            <div className="max-w-2xl mx-auto p-4 pb-20 space-y-6">

                {/* ===== 1. 總評 ===== */}
                <section className="glass-card p-6 text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full mx-auto"
                        style={{ background: `conic-gradient(${report.overall.color} ${report.overall.score}%, transparent ${report.overall.score}%)`, padding: '4px' }}>
                        <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
                            <span className="text-3xl font-black text-white">{report.overall.score}</span>
                        </div>
                    </div>
                    <div>
                        <span className="inline-block px-4 py-1 rounded-full text-sm font-bold text-white" style={{ backgroundColor: report.overall.color }}>
                            {report.overall.level}
                        </span>
                    </div>
                    <p className="text-sm text-slate-300">{report.overall.summary}</p>
                    {durationSeconds != null && (
                        <p className="text-xs text-slate-500">分析時長：{formatDuration(durationSeconds)} · 投擲次數：{metrics.throw_count} 次</p>
                    )}
                </section>

                {/* ===== 2. 雷達圖 — 五維能力 ===== */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">🕸️ 五維能力評估</h2>
                    <div className="glass-card p-4 flex justify-center">
                        <RadarChart metrics={metrics} />
                    </div>
                </section>

                {/* ===== 3. 柱狀圖 — 指標對比 ===== */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">📊 指標 vs 理想值</h2>
                    <div className="glass-card p-4">
                        <BarChart metrics={metrics} />
                    </div>
                </section>

                {/* ===== 4. 圓餅圖 — 動作品質 ===== */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">🎯 動作品質分布</h2>
                    <div className="glass-card p-4 flex justify-center">
                        <DonutChart metrics={metrics} />
                    </div>
                </section>

                {/* ===== 5. 關鍵數據 ===== */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">📈 關鍵數據</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="手肘伸展度" value={`${metrics.avg_rom}°`} ideal="≥150°" good={metrics.avg_rom >= 150} />
                        <MetricCard label="軀幹傾斜" value={`${metrics.avg_trunk_tilt}°`} ideal="≤10°" good={metrics.avg_trunk_tilt <= 10} />
                        <MetricCard label="穩定比例" value={`${metrics.stable_ratio}%`} ideal="≥70%" good={metrics.stable_ratio >= 70} />
                        <MetricCard label="震顫偵測" value={`${metrics.tremor_detected_ratio}%`} ideal="≤5%" good={metrics.tremor_detected_ratio <= 5} />
                        {metrics.core_stability_angle !== null && (
                            <MetricCard label="核心穩定角" value={`${metrics.core_stability_angle}°`} ideal="≤8°" good={metrics.core_stability_angle <= 8} />
                        )}
                        <MetricCard label="代償動作" value={`${metrics.compensation_detected_ratio}%`} ideal="≤10%" good={metrics.compensation_detected_ratio <= 10} />
                    </div>
                    {(metrics.avg_shoulder_angular_vel || metrics.avg_elbow_angular_vel || metrics.avg_wrist_angular_vel) && (
                        <div className="glass-card p-4">
                            <p className="text-xs text-slate-500 mb-2">關節角速度 (°/s)</p>
                            <div className="flex gap-4 text-sm">
                                {metrics.avg_shoulder_angular_vel !== null && <span className="text-slate-300">肩 <b className="text-white">{metrics.avg_shoulder_angular_vel}</b></span>}
                                {metrics.avg_elbow_angular_vel !== null && <span className="text-slate-300">肘 <b className="text-white">{metrics.avg_elbow_angular_vel}</b></span>}
                                {metrics.avg_wrist_angular_vel !== null && <span className="text-slate-300">腕 <b className="text-white">{metrics.avg_wrist_angular_vel}</b></span>}
                            </div>
                        </div>
                    )}
                </section>

                {/* ===== 6. 健康風險推論 ===== */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">🏥 相關病症風險推論</h2>
                    <HealthInferences metrics={metrics} />
                </section>

                {/* ===== 7. 優勢 ===== */}
                {report.strengths.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">✅ 優勢項目</h2>
                        <div className="glass-card p-4 space-y-2">
                            {report.strengths.map((s, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm text-green-400">
                                    <span className="shrink-0 mt-0.5">•</span><span>{s}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ===== 8. 需注意 ===== */}
                {report.concerns.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">⚠️ 需注意</h2>
                        <div className="glass-card p-4 space-y-2">
                            {report.concerns.map((c, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm text-amber-400">
                                    <span className="shrink-0 mt-0.5">•</span><span>{c}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ===== 9. AI 建議處方 ===== */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">💊 AI 建議處方</h2>
                    <div className="space-y-4">
                        {report.prescriptions.map((rx, i) => {
                            const style = PRIORITY_STYLES[rx.priority]
                            return (
                                <div key={i} className={`rounded-2xl border-2 p-4 space-y-3 ${style.bg} ${style.border}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{rx.icon}</span>
                                            <div>
                                                <h3 className="font-bold text-white text-sm">{rx.title}</h3>
                                                <span className="text-[10px] text-slate-500">{rx.category}</span>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${style.badge}`}>
                                            優先：{style.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400">{rx.description}</p>
                                    <div className="space-y-1.5">
                                        {rx.exercises.map((ex, j) => (
                                            <div key={j} className="flex items-start gap-2 text-xs text-slate-300">
                                                <span className="text-white font-bold shrink-0">{j + 1}.</span><span>{ex}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="pt-2 border-t border-white/5">
                                        <p className="text-[11px] text-slate-500">📅 建議頻率：{rx.frequency}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* ===== 10. 安全提示 ===== */}
                <section className="glass-card p-4 border-l-4 border-amber-500/50 space-y-2">
                    <h3 className="text-sm font-bold text-amber-400">🛡️ 安全提示</h3>
                    {report.safetyNotes.map((n, i) => (
                        <p key={i} className="text-xs text-slate-400">• {n}</p>
                    ))}
                </section>

                {/* ===== 免責聲明 ===== */}
                <p className="text-[10px] text-slate-600 text-center leading-relaxed">
                    本報告由 AI 系統自動產生，僅供參考。運動處方不構成醫療建議，<br />
                    病症推論不代表診斷，請在專業醫師指導下做進一步檢查。<br />
                    © {new Date().getFullYear()} 惠生長照事業有限公司
                </p>
            </div>
        </div>
    )
}

// ============================================================================
// Sub Components
// ============================================================================

function MetricCard({ label, value, ideal, good }: { label: string; value: string; ideal: string; good: boolean }) {
    return (
        <div className="glass-card p-3 space-y-1">
            <p className="text-[10px] text-slate-500">{label}</p>
            <p className={`text-lg font-bold ${good ? 'text-green-400' : 'text-amber-400'}`}>{value}</p>
            <p className="text-[9px] text-slate-600">理想值 {ideal}</p>
        </div>
    )
}
