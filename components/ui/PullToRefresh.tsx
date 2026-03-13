'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Pull-to-Refresh 下拉刷新元件
 * 類似 iOS 原生 App 的下拉更新體驗
 * 自動跳過 fixed overlay（如報告頁面）
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
    const [pulling, setPulling] = useState(false)
    const [pullDistance, setPullDistance] = useState(0)
    const [refreshing, setRefreshing] = useState(false)
    const startYRef = useRef(0)
    const containerRef = useRef<HTMLDivElement>(null)

    const THRESHOLD = 80
    const MAX_PULL = 120

    const handleTouchStart = useCallback((e: TouchEvent) => {
        // 如果有 fixed overlay（z-50）打開中，不啟用下拉刷新
        const overlay = document.querySelector('.fixed.inset-0.z-50')
        if (overlay) return

        const scrollTop = containerRef.current?.scrollTop ?? window.scrollY
        if (scrollTop <= 0) {
            startYRef.current = e.touches[0].clientY
            setPulling(true)
        }
    }, [])

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!pulling || refreshing) return
        const currentY = e.touches[0].clientY
        const diff = currentY - startYRef.current
        if (diff > 0) {
            const distance = Math.min(diff * 0.5, MAX_PULL)
            setPullDistance(distance)
            if (distance > 10) e.preventDefault()
        }
    }, [pulling, refreshing])

    const handleTouchEnd = useCallback(() => {
        if (!pulling) return
        if (pullDistance >= THRESHOLD && !refreshing) {
            setRefreshing(true)
            setPullDistance(THRESHOLD * 0.6)
            setTimeout(() => { window.location.reload() }, 400)
        } else {
            setPullDistance(0)
        }
        setPulling(false)
    }, [pulling, pullDistance, refreshing])

    useEffect(() => {
        const el = containerRef.current || document
        const opts: AddEventListenerOptions = { passive: false }
        el.addEventListener('touchstart', handleTouchStart as any, opts)
        el.addEventListener('touchmove', handleTouchMove as any, opts)
        el.addEventListener('touchend', handleTouchEnd as any)
        return () => {
            el.removeEventListener('touchstart', handleTouchStart as any)
            el.removeEventListener('touchmove', handleTouchMove as any)
            el.removeEventListener('touchend', handleTouchEnd as any)
        }
    }, [handleTouchStart, handleTouchMove, handleTouchEnd])

    const progress = Math.min(pullDistance / THRESHOLD, 1)

    return (
        <div ref={containerRef} className="relative min-h-screen">
            <div
                className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center pointer-events-none transition-transform duration-200"
                style={{
                    transform: `translateY(${pullDistance > 0 ? pullDistance - 50 : -50}px)`,
                    opacity: progress,
                }}
            >
                <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-lg border border-white/20 flex items-center justify-center shadow-lg">
                    {refreshing ? (
                        <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg
                            className="w-5 h-5 text-white/80 transition-transform duration-200"
                            style={{ transform: `rotate(${progress * 180}deg)` }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    )}
                </div>
            </div>
            <div
                className="transition-transform duration-200"
                style={{ transform: pullDistance > 0 ? `translateY(${pullDistance * 0.3}px)` : undefined }}
            >
                {children}
            </div>
        </div>
    )
}
