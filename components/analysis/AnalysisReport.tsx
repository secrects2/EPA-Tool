'use client'

import React, { useRef, useState } from 'react'
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
    high: { bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-500', label: '高' },
    medium: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500', label: '中' },
    low: { bg: 'bg-teal-50', border: 'border-teal-200', badge: 'bg-teal-500', label: '低' },
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
                    return <path key={level} d={path} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                })}
                {/* 軸線 */}
                {dims.map((_, i) => {
                    const p = getPoint(i, maxR)
                    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.04)" strokeWidth={1} />
                })}
                {/* 數據區域 */}
                <path d={dataPath} fill="rgba(13,148,136,0.15)" stroke="#0D9488" strokeWidth={1.5} />
                {dataPoints.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill="#0D9488" stroke="white" strokeWidth={1.5} />
                ))}
                {/* 標籤 */}
                {dims.map((d, i) => {
                    const lp = getPoint(i, maxR + 20)
                    return (
                        <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
                            className="fill-slate-500 text-[10px]">{d.label}</text>
                    )
                })}
            </svg>
        </div>
    )
}

/** 柱狀圖 - 各指標與理想值對比 */
function BarChart({ metrics }: { metrics: AnalysisMetrics }) {
    const bars = [
        { label: 'ROM', value: metrics.avg_rom, ideal: 160, unit: '°', color: '#0D9488' },
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
                            <span className="text-slate-500">{bar.label}</span>
                            <span className={isGood ? 'text-emerald-400' : 'text-amber-400'}>
                                {bar.label === 'ROM' ? `${metrics.avg_rom}${bar.unit}` :
                                    bar.label === '穩定率' ? `${metrics.stable_ratio}${bar.unit}` :
                                        `${Math.round(bar.value)}`}
                            </span>
                        </div>
                        <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
                            {/* 理想值標記線 */}
                            <div className="absolute top-0 bottom-0 w-px bg-slate-400"
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
            <p className="text-[9px] text-[#999] text-center mt-1">灰色標記線 = 理想值</p>
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
        { label: '穩定動作', value: stable, color: '#0D9488' },
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
                <circle cx={cx} cy={cy} r={35} fill="white" />
                <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-800 text-base font-bold">{stable}%</text>
                <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-500 text-[9px]">穩定率</text>
            </svg>
            <div className="space-y-2 text-xs">
                {segments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                        <span className="text-slate-600">{seg.label}</span>
                        <span className="text-slate-800 font-medium ml-auto">{seg.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ============================================================================
// 運動表現風險提示
// ============================================================================

function HealthInferences({ metrics }: { metrics: AnalysisMetrics }) {
    const inferences: { icon: string; condition: string; evidence: string; risk: 'low' | 'medium' | 'high'; color: string }[] = []

    if (metrics.avg_rom < 120) {
        inferences.push({ icon: '🦴', condition: '上肢活動範圍偏低', evidence: `ROM ${metrics.avg_rom}°，低於建議參考值（≥140°）。建議加強上肢伸展訓練，持續偏低時可諮詢專業人員評估。`, risk: 'high', color: '#EF4444' })
    } else if (metrics.avg_rom < 150) {
        inferences.push({ icon: '🦴', condition: '上肢柔軟度略低', evidence: `ROM ${metrics.avg_rom}°，略低於理想值。可透過伸展運動逐步改善。`, risk: 'medium', color: '#F59E0B' })
    }

    if (metrics.avg_trunk_tilt > 20) {
        inferences.push({ icon: '🧘', condition: '軀幹穩定度偏低', evidence: `軀幹傾斜 ${metrics.avg_trunk_tilt}°，明顯偏高（建議參考值 ≤10°，此為工程經驗值）。核心肌群訓練有助改善穩定性。`, risk: 'high', color: '#EF4444' })
    } else if (metrics.avg_trunk_tilt > 12) {
        inferences.push({ icon: '🧘', condition: '核心穩定性可加強', evidence: `軀幹傾斜 ${metrics.avg_trunk_tilt}°，建議強化核心肌群訓練。`, risk: 'medium', color: '#F59E0B' })
    }

    if (metrics.tremor_detected_ratio > 15) {
        inferences.push({ icon: '✋', condition: '手部穩定性異常', evidence: `偵測到不穩定訊號比例 ${metrics.tremor_detected_ratio}%。本數據基於影像分析，受環境光線與裝置影響。若日常生活中也察覺手部持續性抖動，建議諮詢醫療專業人員做進一步評估。`, risk: 'high', color: '#EF4444' })
    } else if (metrics.tremor_detected_ratio > 8) {
        inferences.push({ icon: '✋', condition: '手部穩定性略低', evidence: `偵測率 ${metrics.tremor_detected_ratio}%。可透過握力與精細動作訓練改善。`, risk: 'medium', color: '#F59E0B' })
    }

    if (metrics.compensation_detected_ratio > 30) {
        inferences.push({ icon: '🎯', condition: '頻繁代償動作', evidence: `代償比例 ${metrics.compensation_detected_ratio}%。注意：代償不一定需要矯正，部分可能是身體條件下的自然適應。建議由指導員依個人狀況判斷是否介入。`, risk: 'high', color: '#EF4444' })
    }

    if (inferences.length === 0) {
        inferences.push({ icon: '✅', condition: '目前量測條件下未見異常', evidence: '在本次分析中，各項指標均在建議參考範圍內。結果可能受環境因素影響。', risk: 'low', color: '#10B981' })
    }

    const riskLabels = { low: '正常', medium: '留意', high: '建議關注' }

    return (
        <div className="space-y-3">
            {inferences.map((inf, i) => (
                <div key={i} className="rounded-xl border border-white/10 p-3 flex items-start gap-3">
                    <span className="text-xl mt-0.5">{inf.icon}</span>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-800">{inf.condition}</h4>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: inf.color }}>
                                {riskLabels[inf.risk]}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{inf.evidence}</p>
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
    const contentRef = useRef<HTMLDivElement>(null)
    const [downloading, setDownloading] = useState(false)

    const handleDownloadPdf = async () => {
        if (!contentRef.current || downloading) return
        setDownloading(true)
        try {
            const html2canvas = (await import('html2canvas')).default

            const canvas = await html2canvas(contentRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#0f172a',
                logging: false,
            })

            const fileName = `AI運動分析_${patientName || '長者'}_${new Date().toISOString().slice(0, 10)}`

            // 策略 1: Web Share API（手機原生分享面板 — 支援存檔、傳 LINE、AirDrop 等）
            if (navigator.share && navigator.canShare) {
                try {
                    const blob = await new Promise<Blob>((resolve) =>
                        canvas.toBlob((b) => resolve(b!), 'image/png')
                    )
                    const file = new File([blob], `${fileName}.png`, { type: 'image/png' })
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: 'AI 運動表現分析報告',
                            files: [file],
                        })
                        return // 成功，結束
                    }
                } catch (shareErr) {
                    // 用戶取消分享或不支援，繼續往下走
                    if ((shareErr as Error).name === 'AbortError') return
                }
            }

            // 策略 2: 開新分頁顯示圖片（用戶可長按存圖）
            const imgDataUrl = canvas.toDataURL('image/png')
            const newWindow = window.open('', '_blank')
            if (newWindow) {
                newWindow.document.write(`
                    <!DOCTYPE html>
                    <html><head>
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <title>${fileName}</title>
                        <style>body{margin:0;background:#0f172a;display:flex;flex-direction:column;align-items:center;padding:16px}
                        img{max-width:100%;height:auto;border-radius:8px}
                        p{color:#94a3b8;font-family:sans-serif;font-size:14px;margin:16px 0}</style>
                    </head><body>
                        <p>📱 長按圖片即可儲存到手機</p>
                        <img src="${imgDataUrl}" alt="AI 運動分析報告" />
                    </body></html>
                `)
                newWindow.document.close()
            } else {
                // 策略 3: 無法開新視窗，直接用 data URL 下載
                const link = document.createElement('a')
                link.href = imgDataUrl
                link.download = `${fileName}.png`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
            }
        } catch (err) {
            console.error('PDF 產生失敗:', err)
            alert('PDF 產生失敗，請稍後再試。')
        } finally {
            setDownloading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-lg border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
                <div>
                    <h1 className="text-lg font-bold text-slate-800">📊 AI 運動表現分析報告</h1>
                    <p className="text-xs text-slate-500">{patientName || '長者'} · {now}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownloadPdf}
                        disabled={downloading}
                        className="px-3 py-2 rounded-xl text-sm text-white transition-colors disabled:opacity-50" style={{ background: 'var(--color-primary)' }}
                    >
                        {downloading ? '產生中...' : '📤 儲存報告'}
                    </button>
                    <button onClick={onClose} className="px-3 py-2 rounded-xl bg-slate-200 text-sm text-slate-700 hover:bg-slate-300 transition-colors">
                        ✕ 關閉
                    </button>
                </div>
            </div>

            <div ref={contentRef} className="max-w-2xl mx-auto p-4 pb-20 space-y-6">

                <section className="glass-card p-8 text-center space-y-4">
                    <p className="text-xs" style={{ color: '#999' }}>綜合評分</p>
                    <div className="flex items-baseline justify-center gap-1">
                        <span className="text-5xl font-extrabold" style={{ color: '#222' }}>{report.overall.score}</span>
                        <span className="text-lg font-medium" style={{ color: '#aaa' }}>/100</span>
                    </div>
                    <div>
                        <span className="inline-block px-4 py-1 rounded-full text-sm font-bold text-white" style={{ backgroundColor: report.overall.color }}>
                            {report.overall.level}
                        </span>
                    </div>
                    <p className="text-sm" style={{ color: '#555', lineHeight: 1.8 }}>{report.overall.summary}</p>
                    {durationSeconds != null && (
                        <p className="text-xs" style={{ color: '#999' }}>分析時長：{formatDuration(durationSeconds)} · 投擲次數：{metrics.throw_count} 次</p>
                    )}
                </section>

                {/* ===== 2. 雷達圖 — 五維能力 ===== */}
                <section className="space-y-3">
                    <h2 className="section-title">五維能力評估</h2>
                    <div className="glass-card p-4 flex justify-center">
                        <RadarChart metrics={metrics} />
                    </div>
                </section>

                {/* ===== 3. 柱狀圖 — 指標對比 ===== */}
                <section className="space-y-3">
                    <h2 className="section-title">指標 vs 理想值</h2>
                    <div className="glass-card p-4">
                        <BarChart metrics={metrics} />
                    </div>
                </section>

                {/* ===== 4. 圓餅圖 — 動作品質 ===== */}
                <section className="space-y-3">
                    <h2 className="section-title">動作品質分布</h2>
                    <div className="glass-card p-4 flex justify-center">
                        <DonutChart metrics={metrics} />
                    </div>
                </section>

                {/* ===== 5. 關鍵數據 ===== */}
                <section className="space-y-3">
                    <h2 className="section-title">關鍵數據</h2>
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
                    <h2 className="section-title">運動表現風險提示</h2>
                    <HealthInferences metrics={metrics} />
                </section>

                {/* ===== 7. 優勢 ===== */}
                {report.strengths.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="section-title">優勢項目</h2>
                        <div className="glass-card p-4 space-y-2">
                            {report.strengths.map((s, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm text-green-600">
                                    <span className="shrink-0 mt-0.5">•</span><span>{s}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ===== 8. 需注意 ===== */}
                {report.concerns.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="section-title">需注意</h2>
                        <div className="glass-card p-4 space-y-2">
                            {report.concerns.map((c, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm text-amber-600">
                                    <span className="shrink-0 mt-0.5">•</span><span>{c}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ===== 9. AI 建議處方 ===== */}
                <section className="space-y-3">
                    <h2 className="section-title">AI 訓練建議</h2>
                    <div className="space-y-4">
                        {report.prescriptions.map((rx, i) => {
                            const style = PRIORITY_STYLES[rx.priority]
                            return (
                                <div key={i} className={`rounded-2xl border-2 p-4 space-y-3 ${style.bg} ${style.border}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{rx.icon}</span>
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-sm">{rx.title}</h3>
                                                <span className="text-[10px] text-slate-500">{rx.category}</span>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${style.badge}`}>
                                            優先：{style.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-600">{rx.description}</p>
                                    <div className="space-y-1.5">
                                        {rx.exercises.map((ex, j) => (
                                            <div key={j} className="flex items-start gap-2 text-xs text-[#666]">
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
                <section className="glass-card p-4 border-l-4 border-amber-500 space-y-2">
                    <h3 className="text-sm font-bold text-amber-600">🛡️ 安全提示</h3>
                    {report.safetyNotes.map((n, i) => (
                        <p key={i} className="text-xs text-slate-600">• {n}</p>
                    ))}
                </section>

                {/* ===== 免責聲明 ===== */}
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    本報告由 AI 系統根據即時影像骨架分析自動產生，屬於運動訓練參考資料，<br />
                    不構成任何醫療診斷或治療建議。量測結果受環境光線、裝置性能、<br />
                    衣著遮擋與受測者配合度影響。如有健康疑慮，請諮詢專業醫療人員。<br />
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
            <p className={`text-lg font-bold ${good ? 'text-green-600' : 'text-amber-600'}`}>{value}</p>
            <p className="text-[9px] text-slate-400">理想值 {ideal}</p>
        </div>
    )
}
