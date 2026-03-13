export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6 text-slate-300 space-y-8">
            <h1 className="text-3xl font-bold text-white">隐私权政策</h1>
            <p className="text-sm text-slate-500">最后更新日期：2026 年 3 月</p>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">一、资料收集范围</h2>
                <p>本系统为提供 ICOPE 长者内在能力检测与地板滚球 AI 动作分析服务，将收集以下个人资料：</p>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>长者基本资料（姓名、身份证字号、性别、出生日期、手机号码）</li>
                    <li>健康评估资料（初评及复评量表结果、慢性疾病史）</li>
                    <li>AI 动作分析资料（骨架关键点座标、评测分数）</li>
                    <li>指导员帐号资讯（Google 帐号 Email、姓名）</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">二、资料使用目的</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>提供 ICOPE 前后测评估与追踪服务</li>
                    <li>产生地板滚球 AI 动作分析报告</li>
                    <li>汇出报帐资料供卫生局审核</li>
                    <li>系统功能改善与服务品质提升</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">三、资料保护措施</h2>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>所有资料储存于 Supabase 云端资料库，启用 Row Level Security (RLS)</li>
                    <li>传输过程全程使用 HTTPS 加密</li>
                    <li>仅授权之指导员与管理员可存取对应资料</li>
                    <li>相机画面仅在装置端即时处理，不上传影像至伺服器</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">四、当事人权利</h2>
                <p>依据《个人资料保护法》，您得行使以下权利：</p>
                <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>查询或请求阅览个人资料</li>
                    <li>请求制给复制本</li>
                    <li>请求补充或更正</li>
                    <li>请求停止搜集、处理或利用</li>
                    <li>请求删除</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">五、联络方式</h2>
                <p className="text-sm">如有任何隐私权相关问题，请联系惠生长照事业有限公司。</p>
            </section>
        </div>
    )
}
