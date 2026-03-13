import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 刷新 session
    const { data: { user } } = await supabase.auth.getUser()

    // 未登入 → 重新導向到登入頁
    if (!user) {
        if (request.nextUrl.pathname === '/login') {
            return supabaseResponse
        }
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // 已登入但存取 /login → 重新導向到儀表板
    if (request.nextUrl.pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 檢查帳號是否已停用
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_active, role')
        .eq('id', user.id)
        .single()

    if (profile && profile.is_active === false) {
        // 帳號已停用 → 登出並導向登入頁
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=account_disabled', request.url))
    }

    // 管理員頁面僅 admin 可存取
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!profile || profile.role !== 'admin') {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/elders/:path*',
        '/analysis/:path*',
        '/admin/:path*',
        '/login',
    ],
}
