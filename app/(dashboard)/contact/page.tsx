export default function ContactPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6 text-slate-600 space-y-8">
            <h1 className="text-3xl font-bold text-slate-800">聯絡我們</h1>

            <div className="glass-card p-6 space-y-5">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center text-2xl shrink-0">🏢</div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">KeiSei Holistic Pharmaceutical CO., LTD.</h2>
                        <p className="text-sm text-[#555] mt-1">惠生醫藥集團 — 惠生檢測平台開發與營運</p>
                    </div>
                </div>

                <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3">
                        <span className="text-lg">👤</span>
                        <div>
                            <p className="text-[#888]">代表人</p>
                            <p className="text-[#333]">廖昱喬</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg">🏢</span>
                        <div>
                            <p className="text-[#888]">統一編號</p>
                            <p className="text-[#333]">90686586</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg">📞</span>
                        <div>
                            <p className="text-[#888]">聯絡電話</p>
                            <p className="text-[#333]">04-23196710</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg">📍</span>
                        <div>
                            <p className="text-[#888]">公司地址</p>
                            <p className="text-[#333]">臺中市北區淡溝里臺灣大道二段340號10樓之1</p>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <p className="text-xs text-slate-600">
                        如有系統使用問題、資料更正需求或隱私權相關事宜，歡迎透過上述方式與我們聯繫。
                    </p>
                </div>
            </div>
        </div>
    )
}
