export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6 text-slate-300 space-y-8">
            <h1 className="text-3xl font-bold text-white">服务条款</h1>
            <p className="text-sm text-slate-500">最后更新日期：2026 年 3 月</p>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">一、服务说明</h2>
                <p>「惠生 ICOPE & 地板滚球检测平台」（以下称本系统）由惠生长照事业有限公司开发与营运，提供 ICOPE 长者内在能力前后测评估及地板滚球 AI 动作分析服务。</p>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">二、使用资格</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>本系统仅供经授权之运动指导员、医事人员及系统管理员使用</li>
                    <li>使用者须以 Google 帐号登入，并经管理员核准后方可使用</li>
                    <li>使用者应妥善保管帐号资讯，不得转借他人</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">三、使用规范</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>使用者应依据专业知识正确操作评估工具</li>
                    <li>不得将系统中之个人资料作为评估以外之用途</li>
                    <li>AI 分析结果仅供参考，不得取代专业医疗诊断</li>
                    <li>不得尝试破解、反组译或干扰系统运作</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">四、免责声明</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>本系统之 AI 分析结果仅供辅助参考，不构成医疗建议</li>
                    <li>因不可抗力因素导致之服务中断，本公司不负损害赔偿责任</li>
                    <li>使用者因违反本条款所生之损害，由使用者自行负责</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">五、智慧财产权</h2>
                <p className="text-sm">本系统之所有程式码、介面设计、AI 模型与相关技术均为惠生长照事业有限公司所有，未经书面同意不得复制、修改或散布。</p>
            </section>
        </div>
    )
}
