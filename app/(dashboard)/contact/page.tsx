export default function ContactPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6 text-slate-300 space-y-8">
            <h1 className="text-3xl font-bold text-white">聯絡我們</h1>

            <div className="glass-card p-6 space-y-5">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center text-2xl shrink-0">🏢</div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">惠生長照事業有限公司</h2>
                        <p className="text-sm text-slate-400 mt-1">ICOPE & 地板滾球檢測平台開發與營運</p>
                    </div>
                </div>

                <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3">
                        <span className="text-lg">📧</span>
                        <div>
                            <p className="text-slate-500">電子郵件</p>
                            <p className="text-white">contact@huisheng.com.tw</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg">📞</span>
                        <div>
                            <p className="text-slate-500">聯絡電話</p>
                            <p className="text-white">(02) 1234-5678</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg">📍</span>
                        <div>
                            <p className="text-slate-500">公司地址</p>
                            <p className="text-white">臺灣</p>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                    <p className="text-xs text-slate-600">
                        如有系統使用問題、資料更正需求或隱私權相關事宜，歡迎透過上述方式與我們聯繫。
                    </p>
                </div>
            </div>
        </div>
    )
}
