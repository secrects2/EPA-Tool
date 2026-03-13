export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6 text-slate-300 space-y-8">
            <h1 className="text-3xl font-bold text-white">服務條款</h1>
            <p className="text-sm text-slate-500">最後更新日期：2026 年 3 月</p>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">一、服務說明</h2>
                <p>「惠生 ICOPE & 地板滾球檢測平台」（以下稱本系統）由惠生長照事業有限公司開發與營運，提供 ICOPE 長者內在能力前後測評估及地板滾球 AI 動作分析服務。</p>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">二、使用資格</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>本系統僅供經授權之運動指導員、醫事人員及系統管理員使用</li>
                    <li>使用者須以 Google 帳號登入，並經管理員核准後方可使用</li>
                    <li>使用者應妥善保管帳號資訊，不得轉借他人</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">三、使用規範</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>使用者應依據專業知識正確操作評估工具</li>
                    <li>不得將系統中之個人資料作為評估以外之用途</li>
                    <li>AI 分析結果僅供參考，不得取代專業醫療診斷</li>
                    <li>不得嘗試破解、反組譯或干擾系統運作</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">四、免責聲明</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>本系統之 AI 分析結果僅供輔助參考，不構成醫療建議</li>
                    <li>因不可抗力因素導致之服務中斷，本公司不負損害賠償責任</li>
                    <li>使用者因違反本條款所生之損害，由使用者自行負責</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">五、智慧財產權</h2>
                <p className="text-sm">本系統之所有程式碼、介面設計、AI 模型與相關技術均為惠生長照事業有限公司所有，未經書面同意不得複製、修改或散佈。</p>
            </section>
        </div>
    )
}
