import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch { }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            // 檢查是否已有 profile，若無則建立
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', data.user.id)
                .single()

            if (!existingProfile) {
                await supabase.from('profiles').insert({
                    id: data.user.id,
                    full_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || '指導員',
                    email: data.user.email || '',
                    avatar_url: data.user.user_metadata?.avatar_url || null,
                    organization: null,
                    role: 'instructor',
                    is_active: true,
                })
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // 驗證失敗，返回登入頁並附帶錯誤
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
