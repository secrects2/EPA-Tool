'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { useLiff } from '@/hooks/useLiff'

export default function LoginPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [agreed, setAgreed] = useState(false)
    const [showDisclaimer, setShowDisclaimer] = useState(false)
    const [liffStatus, setLiffStatus] = useState<string | null>(null)
    const liffAttempted = useRef(false)
    const router = useRouter()

    const { liffReady, isInLine, isLoggedIn: liffLoggedIn, lineProfile } = useLiff()

    // URL 錯誤參數
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('error') === 'account_disabled') {
            setError('您的帳號已被管理員停用，請聯絡管理員')
        } else if (params.get('error')) {
            setError('登入失敗，請重試')
        }
    }, [])

    // LIFF 自動登入：LINE App 內 → 呼叫 server API → 取得 Supabase 帳號 → signIn
    useEffect(() => {
        if (!liffReady || !isInLine || !liffLoggedIn || liffAttempted.current) return

        const doLiffLogin = async () => {
            liffAttempted.current = true
            setLiffStatus('正在驗證 LINE 帳號...')

            try {
                // 取得 LIFF Access Token
                const liff = (await import('@line/liff')).default
                const accessToken = liff.getAccessToken()

                if (!accessToken) {
                    setError('無法取得 LINE Access Token')
                    setLiffStatus(null)
                    return
                }

                setLiffStatus('正在建立系統帳號...')

                // 呼叫 Server API 建立帳號
                const res = await fetch('/api/auth/liff', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken }),
                })

                const data = await res.json()

                if (!res.ok || !data.success) {
                    setError(data.error || 'LIFF 登入失敗')
                    setLiffStatus(null)
                    return
                }

                setLiffStatus('登入中...')

                // 用 Server 回傳的帳密登入 Supabase
                const supabase = createClient()
                const { error: signInErr } = await supabase.auth.signInWithPassword({
                    email: data.email,
                    password: data.password,
                })

                if (signInErr) {
                    setError(`登入失敗：${signInErr.message}`)
                    setLiffStatus(null)
                    return
                }

                setLiffStatus(`歡迎，${data.displayName}！`)
                router.push('/dashboard')

            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'LIFF 登入失敗'
                setError(msg)
                setLiffStatus(null)
            }
        }

        doLiffLogin()
    }, [liffReady, isInLine, liffLoggedIn, router])

    // Google OAuth 登入
    const handleGoogleLogin = async () => {
        if (!agreed) {
            setError('請先閱讀並同意免責聲明與服務條款')
            return
        }

        setLoading(true)
        setError(null)
        const supabase = createClient()

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        }
    }

    // LIFF 環境中 → 顯示自動登入畫面
    if (isInLine && liffStatus) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="glass-card p-8 w-full max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#06C755]/20 flex items-center justify-center">
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="#06C755">
                            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">LINE 自動登入中</h2>
                    <p className="text-slate-400 text-sm mb-4">{liffStatus}</p>
                    {!error && (
                        <div className="w-8 h-8 mx-auto border-2 border-[#06C755] border-t-transparent rounded-full animate-spin" />
                    )}
                    {error && (
                        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-500/10 blur-3xl animate-float" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent-500/10 blur-3xl animate-float" style={{ animationDelay: '3s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary-600/5 blur-3xl" />
            </div>

            <div className="glass-card p-8 md:p-12 w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--gradient-primary)' }}>
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">惠生檢測平台</h1>
                    <p className="text-slate-500 text-sm">ICOPE & 地板滾球 AI 檢測系統</p>
                    <p className="text-slate-500 text-xs mt-1">運動指導員專用平台</p>
                </div>

                {/* Features */}
                <div className="space-y-3 mb-6">
                    {[
                        { icon: '🤖', text: 'AI 姿勢即時分析' },
                        { icon: '📊', text: '前後測數據對比' },
                        { icon: '📥', text: 'Excel 報告匯出' },
                    ].map((feature, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm text-slate-600">
                            <span className="text-lg">{feature.icon}</span>
                            <span>{feature.text}</span>
                        </div>
                    ))}
                </div>

                {/* 免責聲明勾選 */}
                <div className="mb-5 space-y-3">
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="agree-terms"
                            checked={agreed}
                            onChange={e => {
                                setAgreed(e.target.checked)
                                if (e.target.checked) setError(null)
                            }}
                            className="mt-1 w-4 h-4 rounded border-slate-300 bg-white text-primary-500 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer shrink-0"
                        />
                        <label htmlFor="agree-terms" className="text-xs text-slate-500 leading-relaxed cursor-pointer">
                            我已閱讀並同意
                            <button type="button" onClick={() => setShowDisclaimer(true)} className="text-primary-400 hover:underline mx-0.5">免責聲明</button>、
                            <a href="/terms" target="_blank" className="text-primary-400 hover:underline">服務條款</a>及
                            <a href="/privacy" target="_blank" className="text-primary-400 hover:underline">隱私權政策</a>
                        </label>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
                )}

                {/* Google Login */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading || !agreed}
                    className={`btn-google w-full justify-center text-base disabled:cursor-not-allowed transition-all ${!agreed ? 'opacity-40' : loading ? 'opacity-50' : ''}`}
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                    )}
                    <span>{loading ? '登入中...' : '使用 Google 帳號登入'}</span>
                </button>

                {liffReady && !isInLine && (
                    <p className="text-center text-[10px] text-slate-600 mt-3">
                        💬 也可從 LINE App 開啟本系統直接登入
                    </p>
                )}

                <p className="text-center text-xs text-slate-500 mt-6">首次登入將自動註冊帳號</p>
            </div>

            {/* 免責聲明彈窗 */}
            {showDisclaimer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card p-6 md:p-8 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">⚠️ 免責聲明</h2>
                            <button onClick={() => setShowDisclaimer(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/20 transition-colors" title="關閉">✕</button>
                        </div>
                        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
                            <section>
                                <h3 className="font-semibold text-white mb-2">一、系統用途與限制</h3>
                                <p>本系統提供之 AI 動作分析、SPPB 評估及 ICOPE 檢測功能，僅作為輔助篩檢與參考工具，<strong className="text-amber-400">不構成醫療診斷、治療建議或專業醫療意見</strong>。</p>
                            </section>
                            <section>
                                <h3 className="font-semibold text-white mb-2">二、AI 分析結果聲明</h3>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>AI 骨架偵測受環境光線、拍攝角度影響，結果可能存在誤差。</li>
                                    <li>系統自動判定之分數僅供參考，應由專業人員最終判斷。</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="font-semibold text-white mb-2">三、使用者責任</h3>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>使用者應確保受測長者身體狀況適合進行測試。</li>
                                    <li>使用者應善盡個人資料保護義務。</li>
                                </ul>
                            </section>
                            <section>
                                <h3 className="font-semibold text-white mb-2">四、損害賠償免責</h3>
                                <p>惠生醫藥集團對因使用本系統造成之任何損害，不負賠償責任。</p>
                            </section>
                        </div>
                        <div className="pt-3 border-t border-white/10 flex gap-3">
                            <button onClick={() => setShowDisclaimer(false)} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 font-medium hover:bg-white/10 transition-colors">關閉</button>
                            <button onClick={() => { setAgreed(true); setShowDisclaimer(false); setError(null) }} className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-500 transition-colors">✓ 我已閱讀並同意</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
