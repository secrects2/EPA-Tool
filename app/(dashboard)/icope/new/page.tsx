'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { AssessmentStage } from '@/types/icope'
import PrimaryAssessmentForm from '@/components/icope/PrimaryAssessmentForm'
import Link from 'next/link'

/** 統一的長者資料（來自 elders 表） */
interface ElderRow {
    id: string
    name: string
    gender: string | null
    birth_date: string | null
    notes: string | null
}

export default function NewAssessmentPage() {
    const router = useRouter()
    const [elders, setElders] = useState<ElderRow[]>([])
    const [loading, setLoading] = useState(true)

    const [selectedElderId, setSelectedElderId] = useState('')
    const [stage, setStage] = useState<AssessmentStage>('initial')
    const [showForm, setShowForm] = useState(false)
    const [patientId, setPatientId] = useState<string | null>(null)
    const [syncing, setSyncing] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')

    // 從 elders 表取資料（所有長輩的統一來源）
    useEffect(() => {
        const fetchElders = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data } = await supabase
                .from('elders')
                .select('id, name, gender, birth_date, notes')
                .eq('instructor_id', user.id)
                .order('name')

            setElders(data || [])
            setLoading(false)
        }
        fetchElders()
    }, [])

    const selectedElder = elders.find(e => e.id === selectedElderId)

    const filteredElders = elders.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    /**
     * 開始評估：確保 patients 表有對應記錄
     * - 先用 name 查詢 patients 表
     * - 若無，自動建立一筆
     * - 取得 patient_id 後再渲染表單
     */
    const handleStartAssessment = async () => {
        if (!selectedElder) return
        setSyncing(true)

        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('未登入')

            // 1. 先查 patients 表是否有同名同生日的記錄
            let query = supabase
                .from('patients')
                .select('id')
                .eq('name', selectedElder.name)

            if (selectedElder.birth_date) {
                query = query.eq('birth_date', selectedElder.birth_date)
            }

            const { data: existingPatients } = await query

            if (existingPatients && existingPatients.length > 0) {
                // 已有記錄，直接使用
                setPatientId(existingPatients[0].id)
            } else {
                // 自動同步到 patients 表
                const { data: newPatient, error } = await supabase
                    .from('patients')
                    .insert({
                        instructor_id: user.id,
                        name: selectedElder.name,
                        id_number: `SYNC-${selectedElder.id.slice(0, 8).toUpperCase()}`,
                        gender: selectedElder.gender || 'male',
                        birth_date: selectedElder.birth_date || new Date().toISOString().slice(0, 10),
                        notes: selectedElder.notes || null,
                        chronic_diseases: [],
                    })
                    .select('id')
                    .single()

                if (error) throw new Error(error.message)
                setPatientId(newPatient.id)
                toast.success('長者資料已自動同步至 ICOPE 系統')
            }

            setShowForm(true)
        } catch (err: any) {
            toast.error('資料同步失敗: ' + err.message)
        } finally {
            setSyncing(false)
        }
    }

    // 已選好長者 → 顯示初評表單
    if (showForm && patientId && selectedElder) {
        return (
            <div className="max-w-2xl mx-auto">
                <PrimaryAssessmentForm
                    patientId={patientId}
                    patientName={selectedElder.name}
                    stage={stage}
                />
            </div>
        )
    }

    // 選擇長者 & 評估階段
    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div>
                <button onClick={() => router.push('/icope')} className="text-slate-400 hover:text-white transition-colors text-sm mb-2">
                    ← 返回評估列表
                </button>
                <h1 className="text-2xl font-bold text-white">📋 新增 ICOPE 評估</h1>
            </div>

            <div className="glass-card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">選擇評估階段</h2>
                <div className="flex gap-3">
                    {(['initial', 'post'] as AssessmentStage[]).map(s => (
                        <button
                            key={s}
                            onClick={() => setStage(s)}
                            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${stage === s
                                ? 'bg-primary-600 text-white'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                }`}
                        >
                            {s === 'initial' ? '📝 初評' : '📊 後測'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="glass-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">選擇長者</h2>
                    <Link href="/elders?add=true" className="text-xs text-primary-400 hover:underline">
                        + 新增長者
                    </Link>
                </div>

                {/* 搜尋 */}
                {elders.length > 5 && (
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="搜尋姓名..."
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none transition-colors text-sm"
                    />
                )}

                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filteredElders.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <p className="text-4xl mb-2">👤</p>
                        <p>尚無長者資料</p>
                        <Link href="/elders?add=true" className="text-sm text-primary-400 hover:underline mt-2 inline-block">
                            前往新增長者 →
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                        {filteredElders.map(elder => (
                            <button
                                key={elder.id}
                                onClick={() => setSelectedElderId(elder.id)}
                                className={`w-full text-left p-4 rounded-xl transition-all ${selectedElderId === elder.id
                                    ? 'bg-primary-600/20 border-2 border-primary-500/40'
                                    : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white ${elder.gender === 'female' ? 'bg-pink-600/60' : 'bg-blue-600/60'}`}>
                                        {elder.name[0]}
                                    </div>
                                    <div>
                                        <p className="text-white font-medium">{elder.name}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {elder.gender === 'female' ? '女' : '男'}
                                            {elder.birth_date && ` · ${elder.birth_date}`}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <button
                onClick={handleStartAssessment}
                disabled={!selectedElderId || syncing}
                className="w-full btn-accent text-base py-3.5 disabled:opacity-30"
            >
                {syncing ? '同步資料中...' : '開始初評 →'}
            </button>
        </div>
    )
}
