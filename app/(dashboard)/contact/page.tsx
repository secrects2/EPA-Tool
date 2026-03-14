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

                {/* Google Maps */}
                <div className="rounded-2xl overflow-hidden border border-[#eee]">
                    <iframe
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3640.2!2d120.6725!3d24.1565!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjTCsDA5JzIzLjQiTiAxMjDCsDQwJzIxLjAiRQ!5e0!3m2!1szh-TW!2stw!4v1"
                        width="100%"
                        height="250"
                        style={{ border: 0 }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="惠生醫藥集團地圖"
                    />
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <p className="text-xs text-[#888]">
                        如有系統使用問題、資料更正需求或隱私權相關事宜，歡迎透過上述方式與我們聯繫。
                    </p>
                </div>
            </div>
        </div>
    )
}
