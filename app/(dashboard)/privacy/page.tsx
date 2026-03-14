export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6 text-slate-600 space-y-8">
            <h1 className="text-3xl font-bold text-slate-800">隱私權政策</h1>
            <p className="text-sm text-slate-500">最後更新日期：2026 年 3 月</p>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-800">一、資料蒐集範圍</h2>
                <p>本系統為提供 ICOPE 長者內在能力檢測與地板滾球 AI 動作分析服務，將蒐集以下個人資料：</p>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>長者基本資料（姓名、身分證字號、性別、出生日期、手機號碼）</li>
                    <li>健康評估資料（初評及複評量表結果、慢性疾病史）</li>
                    <li>AI 動作分析資料（骨架關鍵點座標、評測分數）</li>
                    <li>指導員帳號資訊（Google 帳號 Email、姓名）</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-800">二、資料使用目的</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>提供 ICOPE 前後測評估與追蹤服務</li>
                    <li>產生地板滾球 AI 動作分析報告</li>
                    <li>匯出報帳資料供衛生局審核</li>
                    <li>系統功能改善與服務品質提升</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-800">三、資料保護措施</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>所有資料儲存於 Supabase 雲端資料庫，啟用 Row Level Security (RLS)</li>
                    <li>傳輸過程全程使用 HTTPS 加密</li>
                    <li>僅授權之指導員與管理員可存取對應資料</li>
                    <li>相機畫面僅在裝置端即時處理，不上傳影像至伺服器</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-800">四、當事人權利</h2>
                <p>依據《個人資料保護法》，您得行使以下權利：</p>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>查詢或請求閱覽個人資料</li>
                    <li>請求製給複製本</li>
                    <li>請求補充或更正</li>
                    <li>請求停止蒐集、處理或利用</li>
                    <li>請求刪除</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-800">五、聯絡方式</h2>
                <p className="text-sm">如有任何隱私權相關問題，請聯繫惠生醫藥集團。</p>
            </section>
        </div>
    )
}
